import logging from "loglevel"
import prefix from "loglevel-plugin-prefix"

const logs = logging.noConflict()
const prefixer = prefix.noConflict()

prefixer.reg(logs)
prefixer.apply(logs)

logs.setDefaultLevel(logging.levels.WARN)

export default logs
