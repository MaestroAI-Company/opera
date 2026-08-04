export interface CloudUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export interface CloudProvider {
  /**
   * Unique identifier of the provider (used to persist the active provider).
   */
  getId(): string;

  /**
   * Whether the provider has enough saved config to start a connection.
   * Providers that need no setup can omit it.
   */
  isConfigured?(): Promise<boolean>;

  /**
   * Authenticate with the cloud provider.
   * Should trigger the OAuth flow if needed, or silently restore the session.
   * @param forcePrompt If true, forces the user to select an account/consent again.
   */
  authenticate(forcePrompt?: boolean): Promise<boolean>;

  /**
   * Logout from the cloud provider and clear local tokens.
   */
  logout(): Promise<void>;

  /**
   * Get the current authenticated user's info.
   */
  getUserInfo(): Promise<CloudUserInfo | null>;

  /**
   * Upload a file with the given content.
   * If the file already exists, it should overwrite it.
   */
  uploadFile(filename: string, content: string): Promise<boolean>;

  /**
   * Download a file's content as a string.
   * Returns null if the file does not exist.
   */
  downloadFile(filename: string): Promise<string | null>;

  /**
   * Delete a file by filename.
   */
  deleteFile(filename: string): Promise<boolean>;
}
