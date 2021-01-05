export interface ILazyInitializer<T> {
    (): T
}

export class Lazy<T> {
    private _instance: T | null = null
    private initializer: ILazyInitializer<T>

    constructor(initializer: ILazyInitializer<T>) {
        this.initializer = initializer
    }

    public get instance(): T {
        if (this._instance == null) {
            this._instance = this.initializer()
        }

        return this._instance
    }
}
