import { browser, Runtime, Tabs } from "webextension-polyfill-ts"
import { v4 as uuidv4 } from "uuid"
import { serialize, deserialize } from "typescript-json-serializer"
import yaml from "js-yaml"

import { Lazy } from "Utils/Lazy"
import { Backend } from "Common/Backend"
import { Config } from "Common/Config"
import logs from "Common/Logging"
import {
    Method,
    CreateSessionRequest,
    CreateSessionResult,
    OpenSessionRequest,
    OpenSessionResult,
} from "Common/Protocol"

const backend = new Backend()

const pendingSessions = new Map<string, string>()

const hostConnector = new Lazy<Runtime.Port>(() =>
    browser.runtime.connectNative(Config.HOST_CONNECTOR_ID)
)

const arrayCompare = (array1: any[], array2: any[]): boolean => {
    const array2Sorted = array2.slice().sort()
    return (
        array1.length === array2.length &&
        array1
            .slice()
            .sort()
            .every((value, index) => {
                return value === array2Sorted[index]
            })
    )
}

const setBadge = (windowId: number, text: string | null = "!") => {
    browser.browserAction.setBadgeText({
        text: text,
        windowId: windowId,
    })
}

const clearBadge = (windowId: number) => setBadge(windowId, null)

const setWindowTitlePrefix = (windowId: number, prefix: string) => {
    browser.windows.update(windowId, {
        titlePreface: `${prefix} – `,
    })
}

const watchSessions = () => {
    browser.tabs.onCreated.addListener(onTabCreated)
    browser.tabs.onRemoved.addListener(onTabRemoved)
    browser.tabs.onUpdated.addListener(onTabUpdated, {
        properties: ["title"],
    })
}

const onTabCreated = (tab: Tabs.Tab) => {
    logs.info(`tab ${tab.id} created`)
    if (tab.windowId !== undefined) onSessionChanged(tab.windowId, null)
}

const onTabRemoved = (
    tabId: number,
    removeInfo: Tabs.OnRemovedRemoveInfoType
) => {
    logs.info(`tab ${tabId} removed`)
    onSessionChanged(removeInfo.windowId, tabId)
}

const onTabUpdated = (
    tabId: number,
    changeInfo: Tabs.OnUpdatedChangeInfoType
) => {
    logs.info(`tab ${tabId} updated`)
    if (changeInfo.url === undefined && changeInfo.title === undefined) return

    browser.tabs.get(tabId).then(
        (tab) => {
            if (tab.windowId !== undefined)
                onSessionChanged(tabId, tab.windowId)
        },
        (error) => {
            logs.error(error)
        }
    )
}

const onSessionChanged = (windowId: number, tabId: number | null = null) => {
    browser.windows
        .get(windowId, {
            populate: true,
        })
        .then(
            (window) => {
                if (window.tabs === undefined) return
                backend.sessions
                    .get({
                        windowId: windowId,
                    })
                    .then(
                        (session) => {
                            if (
                                session === undefined ||
                                arrayCompare(
                                    session.tabs!,
                                    window
                                        .tabs!.filter((tab) => tab.id! != tabId)
                                        .map((tab) => tab.url)
                                )
                            ) {
                                logs.debug(`clearing ${windowId}`)
                                clearBadge(windowId)
                            } else {
                                logs.debug(`setting ${windowId}`)
                                setBadge(windowId)
                            }
                        },
                        (error) => {
                            logs.error(error)
                        }
                    )
            },
            (error) => {
                logs.error(error)
            }
        )
}

browser.windows.onRemoved.addListener((windowId) => {
    backend.sessions
        .get({
            windowId: windowId,
        })
        .then((session) => {
            if (session === undefined) return
            backend.sessions.delete(session.id)
        })
})
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (sender.id != Config.EXTENSION_ID) return

    let key: string
    const session = await backend.sessions.get({
        windowId: message.windowId,
    })

    if (session === undefined) {
        key = uuidv4()
        backend.sessions.add({
            id: key,
            windowId: message.windowId,
            // @ts-ignore
            tabs: message.tabs.map((tab) => tab.url),
        })
    } else {
        key = session.id
        backend.sessions.put({
            id: key,
            windowId: message.windowId,
            // @ts-ignore
            tabs: message.tabs.map((tab) => tab.url),
        })
    }

    const request = new CreateSessionRequest(
        message.name,
        yaml.dump({
            uuid: key,
            tabs: message.tabs,
        })
    )

    pendingSessions.set(request.id, key)
    hostConnector.instance.postMessage(serialize(request))
})
hostConnector.instance.onMessage.addListener(async (message) => {
    switch (message.method) {
        case Method.Event:
            if (message.data == "dialog-shown")
                browser.runtime.sendMessage("close")

            break
        case Method.Create:
            const result = deserialize<CreateSessionResult>(
                message,
                CreateSessionResult
            )

            if (result.data === undefined) return

            if (![...pendingSessions.keys()].includes(result.context)) return

            let session = await backend.sessions.get({
                id: pendingSessions.get(result.context),
            })

            if (session === undefined) return

            clearBadge(session.windowId)
            setWindowTitlePrefix(session.windowId, result.data.name)
            backend.sessions.put({
                id: session.id,
                name: result.data.name,
                uri: result.data.uri,
                windowId: session.windowId,
                tabs: session.tabs,
            })
            pendingSessions.delete(result.context)
            watchSessions()

            break
        case Method.Open:
            const request = deserialize<OpenSessionRequest>(
                message,
                OpenSessionRequest
            )
            const data = yaml.load(request.data)

            if ((session = await backend.sessions.get(data.uuid)) !== undefined)
                return

            const tabs = data.tabs as Tabs.Tab[]
            browser.windows
                .create({
                    url: tabs[0].url,
                })
                .then(
                    (windowInfo) => {
                        tabs.slice(1).forEach((tab) => {
                            browser.tabs.create({
                                url: tab.url,
                                discarded: tab.active ? false : true,
                                windowId: windowInfo.id,
                            })
                        })
                        hostConnector.instance.postMessage(
                            OpenSessionResult.withSuccess(request.id, true)
                        )
                        backend.sessions.add({
                            id: data.uuid,
                            name: request.name,
                            uri: request.uri,
                            windowId: windowInfo.id!,
                            // @ts-ignore
                            tabs: data.tabs.map((tab) => tab.url),
                        })
                        setWindowTitlePrefix(windowInfo.id!, request.name!)
                        watchSessions()
                    },
                    (error) => {
                        logs.error(error)
                        hostConnector.instance.postMessage(
                            OpenSessionResult.withError(request.id, error)
                        )
                    }
                )
    }
})
browser.windows
    .getAll({
        populate: true,
    })
    .then(
        (windows) => {
            backend.sessions.each((session) => {
                if (session.tabs === undefined) return

                windows.forEach((window) => {
                    if (
                        window.id !== undefined &&
                        window.tabs !== undefined &&
                        arrayCompare(
                            session.tabs!,
                            window.tabs.map((tab) => tab.url)
                        )
                    ) {
                        setWindowTitlePrefix(window.id, session.name!)
                        backend.sessions.put({
                            id: session.id,
                            name: session.name,
                            uri: session.uri,
                            windowId: window.id,
                            tabs: session.tabs,
                        })
                        watchSessions()

                        return
                    }
                })
            })
        },
        (error) => {
            logs.error(error)
        }
    )
// @ts-ignore
hostConnector.instance.postMessage()
