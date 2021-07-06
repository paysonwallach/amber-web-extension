import Dexie from "dexie"

export interface ISession {
    id: string
    name?: string
    uri?: string
    windowId: number
    tabs?: string[]
    autoSave: boolean
}

export class Backend extends Dexie {
    sessions: Dexie.Table<ISession>

    constructor() {
        super("com.paysonwallach.amber")

        this.version(2).stores({
            sessions: "id, name, uri, windowId, tabs, autoSave",
        })
        this.sessions = this.table("sessions")
    }
}
