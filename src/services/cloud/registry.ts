import type { ComponentType } from 'react';
import NextcloudSetup from '../../components/features/NextcloudSetup';
import { CloudProvider } from './CloudProvider';
import { GoogleDriveProvider } from './GoogleDriveProvider';
import { NextcloudProvider } from './NextcloudProvider';


export interface CloudProviderDefinition {
  id: string;
  label: string;
  create: () => CloudProvider;
  SetupComponent?: ComponentType<{ onDone: () => void }>;
}

export const CLOUD_PROVIDERS: CloudProviderDefinition[] = [
  { id: 'google_drive', label: 'Google Drive', create: () => new GoogleDriveProvider() },
  { id: 'nextcloud', label: 'Nextcloud', create: () => new NextcloudProvider(), SetupComponent: NextcloudSetup },
];

export function getCloudProviderDefinition(id: string): CloudProviderDefinition | undefined {
  return CLOUD_PROVIDERS.find(def => def.id === id);
}
