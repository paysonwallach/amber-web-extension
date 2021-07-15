import React from "react"
import ReactDOM from "react-dom"

import optionsStorage from "Common/Options"

export const OptionsForm: React.FC = () => {
    return (
        <form>
            <label htmlFor="autoSave">
                <input type="checkbox" name="autoSave" />
                Enable automatic session saving by default
            </label>
        </form>
    )
}

ReactDOM.render(<OptionsForm />, document.getElementById("options"))
optionsStorage.syncForm(document.querySelector("form")!)
