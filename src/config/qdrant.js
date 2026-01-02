import { QdrantClient } from "@qdrant/js-client-rest";
import {config} from "./credential.js";

export const qdrant = new QdrantClient({
    url: config.url.qdrnt_url,
    apiKey: config.key.qdrnt_key
});
