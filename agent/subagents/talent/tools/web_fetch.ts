// Least privilege: no shell, file or web access, even before the session picks its config.
import { disableTool } from "eve/tools";

export default disableTool();
