export interface CloudUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Result of a download. `unchanged` is only ever returned when the caller
 * supplied a tag that still matches the remote file. `error` must be used for
 * any failure, so callers never mistake an unreachable server for an empty one.
 */
export type CloudDownload =
  | { status: 'ok'; content: string; tag: string | null }
  | { status: 'unchanged' }
  | { status: 'missing' }
  | { status: 'error' };

export type CloudUpload = { ok: boolean; tag: string | null };

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
   * Reports the new remote tag when the provider exposes one.
   */
  uploadFile(filename: string, content: string): Promise<CloudUpload>;

  /**
   * Download a file's content.
   * When knownTag still matches the remote file, answer 'unchanged' rather
   * than transferring the content again.
   */
  downloadFile(filename: string, knownTag?: string | null): Promise<CloudDownload>;

  /**
   * Delete a file by filename.
   */
  deleteFile(filename: string): Promise<boolean>;
}
