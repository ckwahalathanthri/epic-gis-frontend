import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MapStateService {
  // --- View State ---
  readonly is3DMode = signal<boolean>(false);

  // --- Popup State ---
  readonly showFeaturePopup = signal<boolean>(false);
  readonly popupFeatureName = signal<string>('');
  readonly popupAttributes = signal<{ key: string; value: string }[]>([]);
  readonly popupGraphic = signal<any>(null);
  readonly popupBackendLayerId = signal<string | null>(null);

  // --- Edit Panel State ---
  readonly showEditPanel = signal<boolean>(false);
  readonly editProperties = signal<{ key: string; value: string }[]>([]);
  readonly editingFeatureId = signal<number | null>(null);
  readonly editingLayerId = signal<string | null>(null);
  readonly isSaving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);

  // --- Actions / Mutations ---
  
  toggle3DMode() {
    this.is3DMode.set(!this.is3DMode());
  }

  openFeaturePopup(featureName: string, attributes: any[], graphic: any, backendLayerId: string) {
    this.popupFeatureName.set(featureName);
    this.popupAttributes.set(attributes);
    this.popupGraphic.set(graphic);
    this.popupBackendLayerId.set(backendLayerId);
    this.showFeaturePopup.set(true);
  }

  closeFeaturePopup() {
    this.showFeaturePopup.set(false);
  }

  openEditPanel(featureId: number | null, layerId: string | null, properties: any[]) {
    this.editingFeatureId.set(featureId);
    this.editingLayerId.set(layerId);
    this.editProperties.set(properties);
    this.showEditPanel.set(true);
    this.saveSuccess.set(false);
    this.closeFeaturePopup(); // Usually opening edit closes the info popup
  }

  closeEditPanel() {
    this.showEditPanel.set(false);
    this.editProperties.set([]);
    this.editingFeatureId.set(null);
    this.editingLayerId.set(null);
    this.isSaving.set(false);
    this.saveSuccess.set(false);
  }

  setSaving(saving: boolean) {
    this.isSaving.set(saving);
  }

  setSaveSuccess(success: boolean) {
    this.saveSuccess.set(success);
  }
}