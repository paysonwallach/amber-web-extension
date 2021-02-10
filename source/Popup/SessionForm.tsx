import React from "react"

export interface SessionFormIProps {
    name?: string
    onSessionNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export class SessionForm extends React.Component<SessionFormIProps, {}> {
    render() {
        return (
            <form onSubmit={this.props.onSubmit}>
                <label>
                    Session:
                    <input
                        type="text"
                        value={this.props.name}
                        onChange={this.props.onSessionNameChange}
                    />
                </label>
                <br />
                <input type="submit" value="Save" />
            </form>
        )
    }
}
