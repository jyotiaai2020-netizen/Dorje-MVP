// Connector IDs for the app-user Google Drive and OneDrive connectors.
// Filled in once the workspace connectors are registered (OAuth client credentials provided).
export const GOOGLE_DRIVE_CONNECTOR_ID = "";
export const ONEDRIVE_CONNECTOR_ID = "";

export const PROVIDER_ID = (p) => (p === "google" ? GOOGLE_DRIVE_CONNECTOR_ID : ONEDRIVE_CONNECTOR_ID);