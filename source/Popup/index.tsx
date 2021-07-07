import React from "react"
import ReactDOM from "react-dom"

import { browser, Tabs } from "webextension-polyfill-ts"

import { SessionForm } from "Popup/SessionForm"
import { Config } from "Common/Config"
import { Backend } from "Common/Backend"

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
                    // @ts-ignore
                    obj[key] = item[key]
                    return obj
                }, {})
        })
}

function Popup() {
    const [name, setName] = React.useState(String.Empty)
    const activityIndicatorContainer =
        document.getElementById("activity-indicator")!
    const popupContainer = document.getElementById("popup")!

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
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
                    })
                })
            })
    }
    const handleSessionNameChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ): void => {
        setName(event.target.value)
    }

    browser.runtime.onMessage.addListener((message, sender) => {
        if (sender.id != Config.EXTENSION_ID) return
        if (message == "close") window.close()
    })
    browser.windows.getCurrent().then(async (window) => {
        if (window.id === undefined) return

        const db = new Backend()
        const session = await db.sessions.get({
            windowId: window.id,
        })

        if (session === undefined || session.name === undefined) return

        setName(session.name)
    })

    return (
        <SessionForm
            name={name}
            onSubmit={handleSubmit}
            onSessionNameChange={handleSessionNameChange}
        />
    )
}

ReactDOM.render(<Popup />, document.getElementById("popup"))
