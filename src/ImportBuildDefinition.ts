/// <reference types="vss-web-extension-sdk" />
import BuildContracts = require("TFS/Build/Contracts");
import BuildRestClient = require("TFS/Build/RestClient");
import FileInput = require("VSS/Controls/FileInput");
import CoreClient = require("TFS/Core/RestClient");
import CoreContracts = require("TFS/Core/Contracts");
import { BaseDefinition } from "./BaseDefinition";
import { CustomTask, CustomEndpoint } from "./DefinitionMetaData";
import * as Services from "VSS/Authentication/Services";
import TaskAgentRestClient = require("TFS/DistributedTask/TaskAgentRestClient");
import * as Controls from "VSS/Controls";
import * as StatusIndicator from "VSS/Controls/StatusIndicator";
import * as Dialogs from "VSS/Controls/Dialogs";
import uuidv4 = require("uuid/v4");

export class ImportBuildDefinition {
    "use strict";

    async doesTaskExist(taskId: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            resolve(false);
        });
    }
    async parseUploadedJson(updateContent: FileInput.FileInputControlUpdateEventData): Promise<BuildContracts.BuildDefinition> {
        return new Promise<BuildContracts.BuildDefinition>(async (resolve, reject) => {
            // Create the wait control in a container element
            let container = $(".container");
            let waitControlOptions: StatusIndicator.IWaitControlOptions = {
                target: $(".loader"),
                message: "Analysing file...Please wait!",
                cancellable: false
            };

            let waitControl = Controls.create(StatusIndicator.WaitControl, container, waitControlOptions);

            try {
                let $errorDiv = $(".errorDiv");
                let $errorList = $("#error-list");
                let $loader = $("#loader");

                let isError = false;
                let isWarning = false; // set true by default to show a info message always.
                let definitionName = "";
                $errorDiv.hide();
                $errorList.empty();

                let fileData = null;
                if (!updateContent.loading && updateContent.files.length === 1 && updateContent.files[0].content) {
                    fileData = updateContent.files[0].content;

                    waitControl.startWait();
                    console.log(`File uploaded...${updateContent.files[0].name}`);
                    let baseDefinition: BaseDefinition = JSON.parse(fileData);
                    let definition: BuildContracts.BuildDefinition;
                    let webContext = VSS.getWebContext();
                    let taskAgentRestClient = TaskAgentRestClient.getClient();

                    if (baseDefinition.hasOwnProperty("metaData")) {
                        console.log("New schema, so extract the definition");
                        definition = baseDefinition.definition;
                        isWarning = true;
                        definitionName = await this.getNameForDefinition(definition.name, webContext.project.name);

                        console.log("Checking for custom tasks...");
                        let metaData = baseDefinition.metaData;
                        // check if custom tasks (id and version) exist, if yes continue
                        let allTasks = await taskAgentRestClient.getTaskDefinitions();
                        let customTasks = allTasks.filter((task) => {
                            return task.serverOwned === false;
                        });
                        if (metaData.customTasks) {
                            metaData.customTasks.forEach(mct => {
                                let taskExists = customTasks.some(x => x.id === mct.id);
                                console.log(`Task ${mct.friendlyName} exist = ${taskExists}`);
                                if (taskExists !== true) {
                                    isError = true;
                                    $errorList.append(`<li class="utk-error-circle">Task <strong>${mct.friendlyName}</strong> v${mct.version} by ${mct.author} does not exist.</li>`);
                                }
                            });
                        }

                        // check if service endpoints with same name exist, if yes, replace as it might have a different guid.
                        console.log("Checking for service endpoints...");
                        if (metaData.serviceEndpoints) {
                            let allEndpoints = await taskAgentRestClient.getServiceEndpoints(webContext.project.id);

                            metaData.serviceEndpoints.forEach(ep => {
                                let epExists = allEndpoints.some(x => x.name === ep.name);
                                console.log(`Endpoint ${ep.displayName} exist = ${epExists} in ${webContext.project.name}`);
                                if (epExists !== true) {
                                    isError = true;
                                    $errorList.append(`<li class="utk-error-circle">Service endpoint named <strong>${ep.name}</strong> of type ${ep.displayName} does not exist.</li>`);
                                }
                            });
                        }
                    }
                    else {
                        console.log("Imported JSON has older schema...");
                        isWarning = true;
                        $errorList.append(`<li class="utk-warning-circle">The uploaded JSON is exported from the older version of the extension. Newer version of JSON provides additional checks for service endpoints. Before importing, you may want to export the definition. </li>`);
                        definition = JSON.parse(fileData);
                        definitionName = await this.getNameForDefinition(definition.name, webContext.project.name);
                    }
                    console.log("Checking for queues and pools");
                    // check pool with name and if yes, replace as it might have a different id
                    let queues = await taskAgentRestClient.getAgentQueues(webContext.project.id);
                    console.log("Got queues...");

                    if (definition.queue && definition.queue.id && definition.queue.name) {
                        console.log("Queue element in JSON is present. Validating...");
                        let queueWithSameNameAndId = queues.some(x => x.id === definition.queue.id && x.name.toLowerCase() === definition.queue.name.toLowerCase());
                        // if queueWithSameNameAndId yes, use it as no change required
                        // if no, continue
                        if (queueWithSameNameAndId !== true) {
                            console.log(`Queue with name ${definition.queue.name} and id ${definition.queue.id} not present...`);
                            // if no, check queue exists with same name, if yes, use the queue and also pool inside this queue
                            let queueWithSameName = queues.filter(x => x.name.toLowerCase() === definition.queue.name.toLowerCase());
                            let queueWithSameId = queues.filter(x => x.id === definition.queue.id);

                            if (queueWithSameName !== null && queueWithSameName.length > 0) {
                                console.log(`Queue with name ${definition.queue.name} exists, use that!`);
                                // if yes, use the queue and also qpool inside this queue
                                let correctQueue = queueWithSameName[0];
                                isWarning = true;
                                $errorList.append(`<li class="utk-warning-circle">Build queue <b>${definition.queue.name}</b> (id: ${definition.queue.id}) referenced in the JSON is not found. The definition will use build queue <b>${correctQueue.name}</b> (id: ${correctQueue.id}) instead.</li>`);
                                // replace
                                definition.queue.name = correctQueue.name;
                                definition.queue.id = correctQueue.id;
                                definition.queue.pool = correctQueue.pool;

                            }
                            else if (queueWithSameId !== null && queueWithSameId.length > 0) {
                                console.log(`Queue with name ${definition.queue.id} exists, using that...`);
                                // check if queue exists with same ID as in definition
                                // if yes, use the queue and also qpool inside this queue
                                let correctQueue = queueWithSameId[0];
                                isWarning = true;
                                $errorList.append(`<li class="utk-warning-circle">Build queue <b>${definition.queue.name}</b> (id: ${definition.queue.id}) referenced in the JSON is not found. The definition will use build queue <b>${correctQueue.name}</b> (id: ${correctQueue.id}) instead.</li>`);

                                // replace
                                definition.queue.name = correctQueue.name;
                                definition.queue.id = correctQueue.id;
                                definition.queue.pool = correctQueue.pool;
                            }
                            else {
                                console.log(`Queue with name ${definition.queue.name} or ${definition.queue.id} is not found. Using the first available queue.`);
                                // cannot find any queue with id/name as definied in the definition json being imported. So use the first available one.
                                let correctQueue = queues[0];
                                isWarning = true;
                                $errorList.append(`<li class="utk-warning-circle">Build queue <b>${definition.queue.name}</b> (id: ${definition.queue.id}) referenced in the JSON is not found. The definition will use build queue <b>${correctQueue.name}</b> (id: ${correctQueue.id}) instead.</li>`);

                                // replace
                                definition.queue.name = correctQueue.name;
                                definition.queue.id = correctQueue.id;
                                definition.queue.pool = correctQueue.pool;
                            }
                        }
                        console.log(`Definition will use queue ${definition.queue.name} id ${definition.queue.id}.`);
                    }
                    else {
                        console.log("Cannot find queue element. Assigining the first available queue.");
                        // cannot find any queue with id/name as definied in the definition json being imported. So use the first available one.
                        let correctQueue = queues[0];
                        isWarning = true;
                        $errorList.append(`<li class="utk-warning-circle">Defintion does not have queue assigned. The definition will use build queue <b>${correctQueue.name}</b> (id: ${correctQueue.id}) instead.</li>`);
                        let que: BuildContracts.AgentPoolQueue = {
                            _links: null,
                            id: correctQueue.id,
                            name: correctQueue.name,
                            pool: correctQueue.pool,
                            url: null
                        };
                        // create queue element.
                        definition["queue"] = que;
                    }
                    // alert(defVersionControl);
                    let coreClient = CoreClient.getClient();

                    console.log("Getting project capabilities...");
                    let project: CoreContracts.TeamProject = await coreClient.getProject(webContext.project.name, true);
                    console.log(project);
                    let capabilities = project.capabilities;

                    if (project.capabilities.hasOwnProperty("versioncontrol") && project.capabilities["versioncontrol"].hasOwnProperty("sourceControlType")) {
                        let definitionVCType: string;
                        let projectVersionControl = capabilities["versioncontrol"]["sourceControlType"];
                        // the project capabilities gives TFVC, Git, SVN, but the defintion uses TfsVersionControl, tfsgit, so translate it.
                        let projectVC = this.fromProjectVCToDefintionVC(projectVersionControl);
                        console.log("projectVC is:", projectVC);

                        // create and set the repository in the json as per the current project
                        console.log("Constructing repository object based on the current project...");
                        let repository: BuildContracts.BuildRepository = {
                            properties: {
                                labelSources: "0",
                            },
                            checkoutSubmodules: false,
                            clean: "undefined",
                            defaultBranch: null,
                            id: projectVersionControl === "git" ? uuidv4() : "$/",
                            name: project.name,
                            rootFolder: null,
                            type: projectVC,
                            url: null
                        };
                        if (projectVersionControl.toLowerCase() === "tfvc") {
                            let mappingsContent = [
                                {
                                    "serverPath": `$/${webContext.project.name}`,
                                    "mappingType": "map",
                                    "localPath": "\\",
                                }
                            ];
                            let mappings = {
                                "mappings": mappingsContent
                            };
                            repository.properties["tfvcMapping"] = JSON.stringify(mappings);
                        }

                        definition.repository = repository;
                        definitionVCType = definition.repository.type;

                        // alert(projectVersionControl)
                        let projVCShort = projectVersionControl === "Tfvc" ? "TFVC" : "Git";
                        definitionVCType = definitionVCType.toLowerCase();
                        let defVCShort = definitionVCType === "tfsversioncontrol" ? "TFVC" : definitionVCType === "tfsgit" ? "Git" : "SVN";
                        if (projVCShort !== defVCShort) {
                            isWarning = true;
                            $errorList.append(`<li class="utk-warning-circle">You are trying to import <strong>${defVCShort}</strong> version controlled definition into <strong>${projVCShort}</strong> version controlled team project. Please validate build definition once it is created.</li>`);
                        }
                    }
                    else {
                        console.log("Unable to detect the project capabilities necessary to validate repository object in the JSON.");
                        throw "Unable to detect the project capabilities necessary to validate repository object in the JSON.";
                    }


                    // $errorList.append("<li class=\"utk-info-circle\"><span>If the repository/project settings from the importing definition file cannot be found, these settings are obtained from current repository/project and replaced in the build definition.</span></li>");
                    $errorList.prepend(`<li class="utk-success-circle">If the import succeeds, it will create a new definition named <b>${definitionName}</b></li>`);
                    if (isError) {
                        $errorList.prepend("Issues with <i class=\"utk-error-circle\"></i> icon should be resolved before importing. If you continue, you might get an <strong>ERROR</strong> during import.");
                    }

                    $errorDiv.fadeIn();
                    console.log("Definition", definition);
                    console.log("Parsing of JSON completed...Waiting for Import Click");
                    resolve(definition);

                } else if (updateContent.loading) {
                    console.log("File is being uploaded...");
                }
            }
            catch (err) {
                let dialogOptions: Dialogs.IModalDialogOptions = {
                    title: "Import build definition",
                    contentText: `Unable to parse the uploaded JSON due to error ${err}`,
                    buttons: [
                        {
                            text: "OK",
                            click: function () {
                                $(this).dialog("close");
                            }
                        }
                    ]
                };
                Dialogs.show(Dialogs.ModalDialog, dialogOptions);
                reject(err);
            }
            finally {
                waitControl.endWait();
            }
        });
    }

    async getQueuesFromThisProject(): Promise<{ id: number, name: string }> {
        return new Promise<{ id: number, name: string }>(async (resolve, reject) => {
            // resolve({id: 10, name: "Defulat"});
            let authTokenManager = Services.authTokenManager;
            let accessToken = await VSS.getAccessToken();
            let header = authTokenManager.getAuthorizationHeader(accessToken);
            console.log(accessToken);

            $.ajaxSetup({
                headers: { "Authorization": header }
            });

            let webContext = VSS.getWebContext();
            let collectionUri = webContext.collection.uri;
            let requestUri = `${collectionUri}${webContext.project.name}/_apis/distributedtask/queues`;
            console.log(requestUri);

            $.ajax({
                url: requestUri,
                type: "GET",
                dataType: "json",
                data: "api-version=3.0-preview.1",
                success: (resp) => {
                    console.log(resp);
                },
                error: (err) => {
                    console.log(err);
                    reject(err);
                }
            });
        });
    }

    async loadFileUploadControl(): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {

            let fileData: BuildContracts.BuildDefinition;

            VSS.require(["VSS/Controls/FileInput"], (controlsFileInput): void => {

                let fileInputOptions: FileInput.FileInputControlOptions = {
                    maximumNumberOfFiles: 1,
                    maximumTotalFileSize: 25 * 1024 * 1024,
                    resultContentType: controlsFileInput.FileInputControlContentType.RawText,
                    allowedFileExtensions: ["json"],

                    updateHandler: async (updateContent: FileInput.FileInputControlUpdateEventData) =>
                        fileData = await this.parseUploadedJson(updateContent)
                };
                controlsFileInput.FileInputControl.createControl($(".fileUploaderContainer"), fileInputOptions);
            });

            resolve({
                getFileContent(): BuildContracts.BuildDefinition {
                    return fileData;
                }
            });
        });

    }

    public getMenuItems(context) {
        console.log("Getting menu from 'Import' handler...");
        let menuItems = [];
        if (!context.hasOwnProperty("type") && context.type === 1) {
            console.log("The definition clicked is XAML...NOT showing 'Import' menu item.");
            // when definition type is XAML do not show the menu items.
            return menuItems;
        } else {
            console.log("The definition clicked is TFS Build...showing 'Import' menu item.");
            // build menu
            let importMenu = {
                text: "Import",
                title: "Import build definition",
                icon: "images/import.png"
            };
            menuItems.push(importMenu);
        }
        return menuItems;
    }

    public execute(actionContext) {
        let webContext = VSS.getWebContext();
        console.log("WebContext", webContext);
        console.log("actioncontext", actionContext);
        let that = this;
        VSS.getService(VSS.ServiceIds.Dialog).then((dialogService: IHostDialogService) => {
            let dialogWindow;

            let dialogOptions: IHostDialogOptions = {
                title: `Import build definition - ${webContext.project.name}`,
                draggable: true,
                width: 700,
                height: 400,
                modal: true,
                okText: "Import",
                getDialogResult: () => {
                    if (dialogWindow) {
                        return dialogWindow.getFileContent();
                    } else
                        return null;
                },
                okCallback(result) {
                    console.log("Import clicked");
                    that.ImportInitiated(result, actionContext, webContext);
                }
            };

            let extInfo = VSS.getExtensionContext();
            let contributionId = `${extInfo.publisherId}.${extInfo.extensionId}.dialogPage`;

            dialogService.openDialog(contributionId, dialogOptions).then(dialog => {
                dialog.getContributionInstance("dialogPage").then((fileUploaderInstance) => {
                    console.log("Dialog Loaded");
                    dialogWindow = fileUploaderInstance;

                });
                dialog.updateOkButton(true);
            });
        });
    }
    public fromProjectVCToDefintionVC(projectVC: string): string {
        switch (projectVC.toLowerCase()) {
            case "tfvc":
                return "TfsVersionControl";
            case "git":
                return "TfsGit";
            case "svn":
                return "Svn";
            default:
                return "TfsVersionControl";
        }
    }

    async getNameForDefinition(originalDefinitionName: string, projectName: string): Promise<string> {
        let buildClient = BuildRestClient.getClient();

        let promise = new Promise<string>(async (resolve, reject) => {
            try {
                let definitionReferences: Array<BuildContracts.BuildDefinitionReference> = await buildClient.getDefinitions(projectName);
                let definitionNames = [];

                for (let defRef of definitionReferences) {
                    definitionNames.push(defRef.name);
                }
                let i = 0;
                let originalName = originalDefinitionName;
                let newName = originalDefinitionName;

                while (definitionNames.indexOf(newName) > -1) {
                    if (i === 0) {
                        newName = `${newName} copy`;
                        i++;
                    } else {
                        newName = `${originalName} copy${i++}`;
                    }
                }
                resolve(newName);
            }
            catch (error) {
                reject(error);
            }
        });
        return promise;



    }

    async ImportInitiated(result, actionContext, webContext): Promise<boolean> {
        let buildDefinition: BuildContracts.BuildDefinition = result;
        console.log(buildDefinition);
        buildDefinition.project = null;
        buildDefinition.authoredBy = null;

        let buildClient = BuildRestClient.getClient();
        let definitionNames = [];

        let newName = await this.getNameForDefinition(buildDefinition.name, webContext.project.name);
        console.log("ProjectName", newName);
        buildDefinition.name = newName;

        try {
            let createdDefinition = await buildClient.createDefinition(buildDefinition, webContext.project.name);
            console.log("ProjectName", newName);
            let navigationService: IHostNavigationService = await VSS.getService<IHostNavigationService>(VSS.ServiceIds.Navigation);
            // Reload whole page
            navigationService.reload();

        } catch (createFailedreason) {
            let definitions: Array<BuildContracts.DefinitionReference> = await buildClient.getDefinitions(webContext.project.name);

            if (definitions.length > 0) {
                // set first available build definition's repository to importing build definition
                // to avoid import exception due to wrong repo settings.
                let firstDefintion: BuildContracts.DefinitionReference = definitions[0];
                console.log("ActionContext", actionContext);
                try {
                    let definition: BuildContracts.BuildDefinition = await buildClient.getDefinition(firstDefintion.id, firstDefintion.project.name);
                    console.log("SelectedDefinition", definition);
                    console.log("SelectedDefinitionrepository", definition.repository);

                    // use the currently selected repo settings.
                    buildDefinition.project = definition.project;
                    let firstDefintionRepository = definition.repository;
                    // clear any service hooks
                    firstDefintionRepository.properties = {};
                    buildDefinition.repository = firstDefintionRepository;

                    await buildClient.createDefinition(buildDefinition, webContext.project.name);
                    let navigationService: IHostNavigationService = await VSS.getService<IHostNavigationService>(VSS.ServiceIds.Navigation);
                    // Reload whole page
                    navigationService.reload();

                } catch (error) {
                    console.log(error.stack);
                    alert(error);
                }
            } else {
                alert("Error creating the definition. Unable to update the repository/project settings with current project. Create a temporary build definition and try importing again!");
            }
        }
        return true;
    }
}

let action = new ImportBuildDefinition();
VSS.register("menuImport", context => {
    return action;
});

VSS.register("dialogPage", async context => {
    return await action.loadFileUploadControl();
});
