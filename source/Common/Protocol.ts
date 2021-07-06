import { v4 as uuidv4 } from "uuid"
import { JsonProperty, Serializable } from "typescript-json-serializer"
import { Tabs } from "webextension-polyfill-ts"

export enum Method {
    Event = "event",
    Open = "open",
    Create = "create",
    Update = "update",
}

@Serializable()
class Error {
    constructor(
        @JsonProperty()
        public readonly code: number,
        @JsonProperty()
        public readonly description?: string
    ) {}
}

@Serializable()
class Message {
    @JsonProperty()
    public readonly apiVersion: string = "v1"

    @JsonProperty()
    public readonly id: string = uuidv4()

    @JsonProperty()
    public readonly method: string

    constructor(method: string) {
        this.method = method
    }
}

@Serializable()
export class Event extends Message {
    constructor(
        @JsonProperty()
        public readonly name: string
    ) {
        super(Method.Event)
    }
}

@Serializable()
export class CreateSessionRequest extends Message {
    constructor(
        @JsonProperty()
        public readonly sessionName: string,
        @JsonProperty()
        public readonly data: string
    ) {
        super(Method.Create)
    }
}

@Serializable()
export class CreateSessionResultData {
    constructor(
        @JsonProperty()
        public readonly name: string,
        @JsonProperty()
        public readonly uri: string
    ) {}
}

@Serializable()
export class CreateSessionResult extends Message {
    @JsonProperty()
    data?: CreateSessionResultData

    @JsonProperty()
    error?: Error

    constructor(
        @JsonProperty()
        public readonly context: string
    ) {
        super(Method.Create)
    }
}

export class OpenSessionRequestData {
    constructor(
        public readonly autoSave: boolean,
        public readonly uuid: string,
        public readonly tabs: Tabs.Tab[]
    ) {}
}

@Serializable()
export class OpenSessionRequest extends Message {
    constructor(
        @JsonProperty()
        public readonly name: string,
        @JsonProperty()
        public readonly uri: string,
        @JsonProperty()
        public readonly data: string
    ) {
        super(Method.Open)
    }
}

@Serializable()
export class OpenSessionResultData {
    constructor(
        @JsonProperty()
        public readonly success: boolean
    ) {}
}

@Serializable()
export class OpenSessionResult extends Message {
    private constructor(
        @JsonProperty()
        public readonly context: string,
        @JsonProperty()
        public readonly data?: OpenSessionResultData,
        @JsonProperty()
        public readonly error?: Error
    ) {
        super(Method.Open)
    }

    public static withSuccess(context: string, success: boolean) {
        return new OpenSessionResult(
            context,
            new OpenSessionResultData(success)
        )
    }

    public static withError(context: string, error: Error) {
        return new OpenSessionResult(context, undefined, error)
    }
}

@Serializable()
export class UpdateSessionRequest extends Message {
    public constructor(
        @JsonProperty()
        public readonly uri: string,
        @JsonProperty()
        public readonly data: string
    ) {
        super(Method.Update)
    }
}
