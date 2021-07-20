import React from "react"
import ReactDOM from "react-dom"

import { browser, Tabs } from "webextension-polyfill-ts"

import { SessionForm } from "Popup/SessionForm"
import { Config } from "Common/Config"
import { Backend } from "Common/Backend"
import optionsStorage from "Common/Options"

interface PopupIProps {
    initialName: string
    intialAutoSave: boolean
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

const Popup = (props: PopupIProps) => {
    const [name, setName] = React.useState(props.initialName)
    const [autoSave, setAutoSave] = React.useState(props.intialAutoSave)
    const activityIndicatorContainer =
        document.getElementById("activity-indicator")!
    const popupContainer = document.getElementById("popup")!

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault()

        popupContainer.classList.add("disabled")
        activityIndicatorContainer.style.visibility = "visible"
        browser.tabs
            .query({ currentWindow: true, hidden: false })
            .then((tabs) => {
                browser.windows.getCurrent().then((windowInfo) => {
                    browser.runtime.sendMessage({
                        name: name,
                        windowId: windowInfo.id,
                        tabs: filter(tabs),
                        autoSave: autoSave,
                    })
                })
            })
    }
    const handleSessionNameChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ): void => {
        setName(event.target.value)
    }
    const handleAutoSaveStateChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ): void => {
        setAutoSave(!autoSave)
    }

    browser.runtime.onMessage.addListener((message, sender) => {
        if (sender.id != Config.EXTENSION_ID) return
        if (message == "close") window.close()
    })

    return (
        <SessionForm
            name={name}
            autoSave={autoSave}
            onSessionNameChange={handleSessionNameChange}
            onAutoSaveStateChange={handleAutoSaveStateChange}
            onSubmit={handleSubmit}
        />
    )
}

browser.windows.getCurrent().then(async (window) => {
    let autoSave = (await optionsStorage.getAll()).autoSave
    let name: string = String.Empty
    if (window.id !== undefined) {
        const db = new Backend()
        const session = await db.sessions.get({
            windowId: window.id,
        })

        if (session !== undefined && session.autoSave !== undefined)
            autoSave = session.autoSave

        if (session !== undefined && session.name !== undefined)
            name = session.name
    }

    ReactDOM.render(
        <Popup initialName={name} intialAutoSave={autoSave} />,
        document.getElementById("popup")
    )
})
