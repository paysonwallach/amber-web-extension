import {
    browser,
    Menus,
    Runtime,
    Tabs,
    Windows,
} from "webextension-polyfill-ts"
import { v4 as uuidv4 } from "uuid"
import { serialize, deserialize } from "typescript-json-serializer"
import yaml from "js-yaml"
import { from } from "rxjs"
import { map, pairwise } from "rxjs/operators"

import { configureStore, createSlice } from "@reduxjs/toolkit"
import { PayloadAction } from "@reduxjs/toolkit/dist/createAction"

import { Lazy } from "Utils/Lazy"
import { Backend } from "Common/Backend"
import { Config } from "Common/Config"
import logs from "Common/Logging"
import {
    Method,
    CreateSessionRequest,
    CreateSessionResult,
    OpenSessionRequest,
    OpenSessionRequestData,
    OpenSessionResult,
    UpdateSessionRequest,
} from "Common/Protocol"

interface SessionsState {
    sessionIds: number[]
    activeSessionId?: number
}

const backend = new Backend()

const initialState = {
    sessionIds: [] as number[],
    activeSessionId: undefined,
} as SessionsState

const sessionSlice = createSlice({
    name: "sessions",
    initialState,
    reducers: {
        sessionAdded(state: SessionsState, action: PayloadAction<number>) {
            state.activeSessionId = action.payload
            state.sessionIds.push(action.payload)
        },
        sessionRemoved(state: SessionsState, action: PayloadAction<number>) {
            const index = state.sessionIds.indexOf(action.payload, 0)
            if (index > -1) state.sessionIds.splice(index, 1)
        },
        activeSessionChanged(
            state: SessionsState,
            action: PayloadAction<number>
        ) {
            state.activeSessionId = action.payload
        },
    },
})
const { sessionAdded, sessionRemoved, activeSessionChanged } =
    sessionSlice.actions

const store = configureStore({
    reducer: { sessions: sessionSlice.reducer },
})

const createSessionMenuItem = (id: number, name: string) => {
    browser.menus.create({
        id: `${id}`,
        title: name,
        contexts: ["tab"],
        parentId: "move-to-session",
        onclick: onSessionMenuItemClicked,
    })
}

const onSessionMenuItemClicked = async (
    info: Menus.OnClickData,
    tab: Tabs.Tab
) => {
    try {
        const tabs = await browser.tabs.query({
            highlighted: true,
            currentWindow: true,
        })
        const tabIds: number[] = tabs
            .filter((tab) => tab.id !== undefined)
            .map((tab) => tab.id!)
        const windowId =
            typeof info.menuItemId === "string"
                ? parseInt(info.menuItemId)
                : info.menuItemId

        if (windowId !== undefined)
            browser.tabs.move(tabIds, { windowId: windowId, index: -1 })
    } catch (error) {
        logs.error(error)
    }
}

const difference = (setA: Set<number>, setB: Set<number>) => {
    const _difference = new Set(setA)

    for (const member of setB) _difference.delete(member)

    return _difference
}

const stateSubscription = from(store)
    .pipe(
        map((state) => {
            return state.sessions.sessionIds.filter(
                (id) => id != state.sessions.activeSessionId
            )
        }),
        pairwise()
    )
    .subscribe(async (state) => {
        if (state[1].lenth <= 1) {
            browser.menus.remove("move-to-session")
            return
        } else if (state[0].length <= 1 && state[1].length > 1) {
            browser.menus.create({
                id: "move-to-session",
                title: "Move to Session",
                contexts: ["tab"],
            })
        }

        const itemsToAdd =
            state[0].length > 1 ? difference(state[1], state[0]) : state[1]
        for (const item of itemsToAdd) {
            const session = await backend.sessions
                .where({ windowId: item })
                .first()
            if (session) createSessionMenuItem(item, session.name)
            else logs.error(`unable to find session for window ${item}`)
        }

        const itemsToRemove = difference(state[0], state[1])
        for (const item of itemsToRemove) browser.menus.remove(`${item}`)
    })

browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId != browser.windows.WINDOW_ID_NONE) {
        store.dispatch(activeSessionChanged(windowId))
    }
})

backend.sessions.each((session) =>
    store.dispatch(sessionAdded(session.windowId))
)
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
    if (removeInfo.isWindowClosing) return
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
                onSessionChanged(tab.windowId, tabId)
        },
        (error) => {
            logs.error(error)
        }
    )
}

const supportedSchemes = ["http", "https", "ws", "wss", "ftp", "data", "file"]
const supportedSchemesRegexp = new RegExp(
    "^(?:" + supportedSchemes.join("|") + ")\\b"
)
const filter = (tabs: Tabs.Tab[]) => {
    const allowed = [
        "highlighted",
        "active",
        "attention",
        "pinned",
        "hidden",
        "incognito",
        "audible",
        "mutedInfo",
        "isArticle",
        "isInReaderMode",
        "url",
        "title",
    ]

    return tabs
        .filter(
            (item) =>
                item.url !== undefined && supportedSchemesRegexp.test(item.url)
        )
        .map((item) => {
            return Object.keys(item)
                .filter((key) => allowed.includes(key))
                .reduce((obj: Record<string, unknown>, key) => {
                    obj[key] = item[key]
                    return obj
                }, {})
        })
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
                                if (session.autoSave) {
                                    backend.sessions
                                        .update(session.id, {
                                            tabs: window.tabs.map(
                                                (tab) => tab.url
                                            ),
                                        })
                                        .then(
                                            (updated) => {
                                                if (session.uri === undefined)
                                                    return

                                                const request =
                                                    new UpdateSessionRequest(
                                                        session.uri,
                                                        yaml.dump({
                                                            uuid: session.id,
                                                            autoSave:
                                                                session.autoSave,
                                                            tabs: filter(
                                                                window.tabs!
                                                            ),
                                                        })
                                                    )
                                                hostConnector.instance.postMessage(
                                                    serialize(request)
                                                )
                                            },
                                            (error) => {
                                                logs.error(error)
                                            }
                                        )
                                } else {
                                    logs.debug(`setting ${windowId}`)
                                    setBadge(windowId)
                                }
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

backend.sessions.hook("creating", (primKey, obj, transaction) => {
    store.dispatch(sessionAdded(obj.windowId))
})
backend.sessions.hook("updating", (mods: any, primKey, obj, trans) => {
    if (mods.hasOwnProperty("name")) {
        try {
            browser.menus.update(`${obj.windowId}`, { title: mods.name })
        } catch (error) {
            logs.error(error)
        }
    }
})
backend.sessions.hook("deleting", (primKey, obj, transaction) => {
    store.dispatch(sessionRemoved(obj.windowId))
})

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

    const session = await backend.sessions.get({
        windowId: message.windowId,
    })
    const key = session === undefined ? uuidv4() : session.id

    backend.sessions.put({
        id: key,
        windowId: message.windowId,
        tabs: message.tabs.map((tab) => tab.url),
        autoSave: message.autoSave,
    })

    const request = new CreateSessionRequest(
        message.name,
        yaml.dump({
            uuid: key,
            autoSave: message.autoSave,
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
                autoSave: session.autoSave,
            })
            pendingSessions.delete(result.context)
            watchSessions()

            break
        case Method.Open:
            const request = deserialize<OpenSessionRequest>(
                message,
                OpenSessionRequest
            )
            const data = yaml.load(request.data) as OpenSessionRequestData

            if ((session = await backend.sessions.get(data.uuid)) !== undefined)
                return

            const tabs = data.tabs as Tabs.Tab[]

            let activeTabIndex = tabs.findIndex((tab) => tab.active)
            if (activeTabIndex == -1) activeTabIndex = 0

            try {
                let windowInfo: Windows.Window | null = null
                const windows = await browser.windows.getAll({
                    populate: true,
                    windowTypes: ["normal"],
                })
                windows.forEach((window) => {
                    if (
                        window.tabs !== undefined &&
                        window.tabs.length == 1 &&
                        window.tabs[0].url !== undefined &&
                        window.tabs[0].url == "about:blank"
                    )
                        windowInfo = window
                })

                if (windowInfo == null)
                    windowInfo = await browser.windows.create({
                        url: tabs[activeTabIndex].url,
                    })

                if (windowInfo.tabs![0].url == "about:blank")
                    browser.tabs.update(windowInfo.tabs![0].id, {
                        url: tabs[activeTabIndex].url,
                    })

                tabs.splice(activeTabIndex, 1)
                tabs.forEach((tab) => {
                    browser.tabs.create({
                        url: tab.url,
                        discarded: !tab.active,
                        windowId: windowInfo!.id,
                    })
                })
                browser.tabs.move(windowInfo.tabs![0].id!, {
                    index: activeTabIndex,
                })
                hostConnector.instance.postMessage(
                    OpenSessionResult.withSuccess(request.id, true)
                )
                backend.sessions.add({
                    id: data.uuid,
                    name: request.name,
                    uri: request.uri,
                    windowId: windowInfo.id!,
                    tabs: data.tabs.map((tab) => tab.url),
                    autoSave: data.autoSave,
                })
                setWindowTitlePrefix(windowInfo.id!, request.name!)
                watchSessions()
            } catch (error) {
                logs.error(error)
                hostConnector.instance.postMessage(
                    OpenSessionResult.withError(request.id, error)
                )
            }
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
                            autoSave: session.autoSave,
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
hostConnector.instance.postMessage()
