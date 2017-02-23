import * as BuildContracts from "TFS/Build/Contracts";
import { DefinitionMetaData } from "./DefinitionMetaData";

export class BaseDefinition {
    definition: BuildContracts.BuildDefinition;
    metaData: DefinitionMetaData;
    version: string;
}