import React from "react"

export interface SessionFormIProps {
    name?: string
    autoSave: boolean
    onSessionNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onAutoSaveStateChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export const SessionForm = (props: SessionFormIProps) => {
    return (
        <form onSubmit={props.onSubmit}>
            <label>
                Session:
                <input
                    type="text"
                    value={props.name}
                    onChange={props.onSessionNameChange}
                />
            </label>
            <br />
            <label htmlFor="autoSave">
                <input
                    type="checkbox"
                    name="autoSave"
                    checked={props.autoSave}
                    onChange={props.onAutoSaveStateChange}
                />
                Automatically save changes
            </label>
            <br />
            <input type="submit" value="Save" />
        </form>
    )
}
