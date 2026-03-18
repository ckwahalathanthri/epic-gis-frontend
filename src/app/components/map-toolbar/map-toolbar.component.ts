import { Component, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapStateService } from '../../services/map-state.service';

@Component({
  selector: 'app-map-edit-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .edit-panel {
      background-color: #122a58 !important; /* Fully solid dark background */
      backdrop-filter: none !important; /* Forces WebGL map underneath to not punch through */
      border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
  `],
  template: `
    <div class="edit-panel" [class.open]="mapState.showEditPanel()">
      <div class="edit-panel-header">
        <div class="edit-panel-header-left">
          <span class="edit-panel-icon">✏️</span>
          <span class="edit-panel-title">Edit Feature</span>
        </div>
        <button class="icon-btn" (click)="onCancel.emit()" title="Close">✕</button>
      </div>

      <div class="edit-panel-body">
        <ng-container *ngIf="mapState.editProperties().length > 0; else emptyProps">
          <div class="edit-field" *ngFor="let prop of mapState.editProperties()">
            <label class="edit-label">{{ prop.key }}</label>
            <input class="edit-input" type="text" [(ngModel)]="prop.value" />
          </div>
        </ng-container>
        <ng-template #emptyProps>
          <div class="edit-empty">No editable properties found.</div>
        </ng-template>
      </div>

      <div class="edit-panel-footer">
        <div *ngIf="mapState.saveSuccess()" class="save-success-msg">✅ Saved successfully!</div>
        <button class="btn-primary" (click)="onSave.emit()" [disabled]="mapState.isSaving() || mapState.saveSuccess()">
          <span *ngIf="mapState.isSaving()">⏳ Saving…</span>
          <span *ngIf="!mapState.isSaving() && !mapState.saveSuccess()">💾 Save Changes</span>
          <span *ngIf="!mapState.isSaving() && mapState.saveSuccess()">✅ Saved</span>
        </button>
        <button class="btn-secondary" (click)="onCancel.emit()">Cancel</button>
      </div>
    </div>
    `
})
export class MapEditPanelComponent {
  constructor(public mapState: MapStateService) {}
  @Output() onSave = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();
}