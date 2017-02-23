/// <reference types="vss-web-extension-sdk" />
import BuildRestClient = require("TFS/Build/RestClient");
import BuildContracts = require("TFS/Build/Contracts");
import CommonContracts = require("TFS/DistributedTask/Contracts");
import TaskAgentRestClient = require("TFS/DistributedTask/TaskAgentRestClient");
import { saveAs } from "filesaver.js";
import { DefinitionMetaData, CustomTask, CustomEndpoint } from "./DefinitionMetaData";
import { BaseDefinition } from "./BaseDefinition";

export class ExportBuildDefinition {
    "use strict";

    public getMenuItems(context) {
        console.log("Getting menu from 'Export' handler...");
        let menuItems: IContributedMenuItem[] = [];
        if (!context.hasOwnProperty("type") && context.type === 1) {
            // when definition type is XAML do not show the menu items.
            console.log("The definition clicked is TFS Build...NOT showing 'Export' menu item.");
            return menuItems;
        } else {
            console.log("The definition clicked is TFS Build...showing 'Export' menu item.");
            // build menu
            let buildMenu: IContributedMenuItem = {
                text: "Export",
                title: "Export build definition",
                icon: "images/export.png",
            };
            menuItems.push(buildMenu);
        }
        return menuItems;
    }
    async execute(actionContext) {
        let extInfo = VSS.getExtensionContext();
        let webContext = VSS.getWebContext();
        let that = this;

        console.log("ExtensionContext", extInfo);
        console.log("WebContext-web", webContext);

        let buildClient = BuildRestClient.getClient();
        let taskAgentRestClient = TaskAgentRestClient.getClient();
        try {
            let definition: BuildContracts.BuildDefinition = await buildClient.getDefinition(actionContext.id, actionContext.project.name);
            console.log(definition);

            let pools = await taskAgentRestClient.getAgentPools();
            console.log(pools);

            // let queues = await taskAgentRestClient.getAgentQueues(webContext.project.id);
            // console.log(queues);

            let additionalMeta: DefinitionMetaData = new DefinitionMetaData();

            let stepsWithServiceEndpoint: Array<BuildContracts.BuildDefinitionStep> = definition.build.filter((builStep) => {
                return builStep.inputs.hasOwnProperty("serverEndpoint");
            });

            let customTasks = await that.getCustomTasks();
            let customEndpoints = [];

            if (definition.repository && definition.repository.properties.hasOwnProperty("connectedServiceId")
                || stepsWithServiceEndpoint.length > 0) {
                // if repository contains connectedServiceId or if any build[i].inputs contains serverEndpoint read and save the ServiceEndpoints
                console.log("Has service endpoint");
                customEndpoints = await that.getEndpointsUsedInTasks(definition, stepsWithServiceEndpoint);
            }

            let baseDefinition: BaseDefinition = new BaseDefinition();
            baseDefinition.version = "0.3";
            baseDefinition.definition = definition;
            baseDefinition.metaData = {
                customTasks: customTasks,
                serviceEndpoints: customEndpoints
            };
            // no need to save the queue/pool name and id as it will be already in definition.
            // queue/pool should be validated before import.
            let jsonDef = JSON.stringify(baseDefinition);
            let blob = new Blob([jsonDef], { type: "application/json" });
            saveAs(blob, `${definition.name}.json`);
        }
        catch (err) {
            alert(`An error occurred!\n\n${err}`);
        }
    }

    async getEndpointsUsedInTasks(definition: BuildContracts.BuildDefinition, stepsWithEndpoint: Array<BuildContracts.BuildDefinitionStep>): Promise<Array<CustomEndpoint>> {
        return new Promise<Array<CustomEndpoint>>(async (resolve, reject) => {
            try {
                let taskAgentRestClient = TaskAgentRestClient.getClient();
                let webContext = VSS.getWebContext();
                let allEndpoints = await taskAgentRestClient.getServiceEndpoints(webContext.project.id);
                let endpointTypes = await taskAgentRestClient.getServiceEndpointTypes();

                let customEndpoints: Array<CustomEndpoint> = [];

                stepsWithEndpoint.forEach((step) => {
                    if (step.inputs.hasOwnProperty("serverEndpoint")) {
                        let endpointId = step.inputs["serverEndpoint"];
                        if (allEndpoints.some(ele => ele.id === endpointId)) {
                            let foundEndpoint = allEndpoints.filter(ele => ele.id === endpointId)[0];
                            let customEndPoint = new CustomEndpoint();
                            customEndPoint.id = foundEndpoint.id;
                            customEndPoint.name = foundEndpoint.name;
                            customEndPoint.type = foundEndpoint.type;
                            if (endpointTypes.some(x => x.name === foundEndpoint.type)) {
                                customEndPoint.displayName = endpointTypes.filter(x => x.name === foundEndpoint.type)[0].displayName;
                            }
                            customEndpoints.push(customEndPoint);
                        }
                    }
                });
                resolve(customEndpoints);
            } catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }

    async getCustomTasks(): Promise<Array<CustomTask>> {
        return new Promise<Array<CustomTask>>(async (resolve, reject) => {
            try {
                let taskAgentRestClient = TaskAgentRestClient.getClient();
                let allTasks = await taskAgentRestClient.getTaskDefinitions();

                let customTasks = allTasks.filter((task) => {
                    return task.serverOwned === false;
                });

                let customTaskList = new Array<CustomTask>();

                customTasks.forEach((task) => {
                    let customTask: CustomTask;
                    customTask = new CustomTask();
                    customTask.author = task.author;
                    customTask.friendlyName = task.friendlyName;
                    customTask.id = task.id;
                    customTask.version = `${task.version.major}.${task.version.minor}.${task.version.patch}`;
                    customTaskList.push(customTask);
                });
                resolve(customTaskList);
            }
            catch (error) {
                console.log(error);
                reject(error);
            }
        });
    }
}

VSS.register("menuExport", context => {
    let action = new ExportBuildDefinition();
    return action;
});