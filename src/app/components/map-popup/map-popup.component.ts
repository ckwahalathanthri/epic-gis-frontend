import { Component, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapStateService } from '../../services/map-state.service';

@Component({
  selector: 'app-map-popup',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .feature-popup {
      background-color: #0a1426 !important; /* Fully solid dark background */
      backdrop-filter: none !important; /* Forces WebGL map underneath to not punch through */
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
  `],
  template: `
    <div *ngIf="mapState.showFeaturePopup()" class="feature-popup">
      <div class="feature-popup-header">
        <span class="feature-popup-title">{{ mapState.popupFeatureName() }}</span>
        <button class="icon-btn" (click)="mapState.closeFeaturePopup()" title="Close">×</button>
      </div>

      <div class="feature-popup-body">
        <table class="attr-table">
          <tr *ngFor="let attr of mapState.popupAttributes()">
            <td class="attr-key">{{ attr.key }}</td>
            <td class="attr-val">{{ attr.value }}</td>
          </tr>
        </table>
      </div>

      <div class="feature-popup-footer">
        <button class="btn-primary" (click)="onEdit.emit()">
          ✏️ Edit Feature
        </button>
      </div>
    </div>
  `
})
export class MapPopupComponent {
  constructor(public mapState: MapStateService) {}
  @Output() onEdit = new EventEmitter<void>();
}