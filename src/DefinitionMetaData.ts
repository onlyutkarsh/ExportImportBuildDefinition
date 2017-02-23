export class DefinitionMetaData {
    customTasks: Array<CustomTask>;
    serviceEndpoints: Array<CustomEndpoint>;
}

export class CustomTask {
    id: string;
    friendlyName: string;
    author: string;
    version: string;
}

export class CustomEndpoint {
    id: string;
    name: string;
    type: string;
    displayName: string;
}