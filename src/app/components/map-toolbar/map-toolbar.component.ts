import { Component, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapStateService } from '../../services/map-state.service';

@Component({
  selector: 'app-map-toolbar',
  standalone: true,
  imports: [CommonModule],
  // We disable encapsulation explicitly so it can override the parent map.css if needed
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .toolbar {
      /* Apply the same gradient as app.css .topbar */
      background: linear-gradient(180deg, rgba(6,12,20,0.85), rgba(4,10,18,0.65)) !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      backdrop-filter: blur(8px) !important;
      color: rgba(255, 255, 255, 0.88);
    }
  `],
  template: `
    <div class="toolbar">
      <div class="toolbar-brand">
        <span>🗺️</span>
        <span>GIS Studio</span>
      </div>
      <div class="toolbar-divider"></div>
      
      <div class="toolbar-section">
        <label class="toolbar-btn upload-btn" title="Upload Shapefile / GeoJSON / KML">
          <span class="btn-icon">📁</span>
          <span>Upload Layer</span>
          <input type="file" (change)="onUpload.emit($event)" accept=".zip,.kml,.kmz,.json,.geojson" />
        </label>
      </div>
      
      <div class="toolbar-divider"></div>
      
      <div class="toolbar-section">
        <button class="toolbar-btn" [class.btn-3d-active]="mapState.is3DMode()" (click)="onToggle3D.emit()">
          <span class="btn-icon">{{ mapState.is3DMode() ? '🗺️' : '🌐' }}</span>
          <span>{{ mapState.is3DMode() ? 'Switch to 2D' : 'Switch to 3D' }}</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-section">
        <button class="toolbar-btn" (click)="onAddFeatureLayer.emit()">
          <span class="btn-icon">＋</span>
          <span>Add Web Layer</span>
        </button>
        <button class="toolbar-btn" (click)="onAddKML.emit()">
          <span class="btn-icon">📌</span>
          <span>Add KML URL</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>
      <p class="toolbar-hint">Click a feature on the map to view and edit its properties.</p>
    </div>
  `
})
export class MapToolbarComponent {
  constructor(public mapState: MapStateService) {}
  
  @Output() onToggle3D = new EventEmitter<void>();
  @Output() onUpload = new EventEmitter<any>();
  @Output() onAddFeatureLayer = new EventEmitter<void>();
  @Output() onAddKML = new EventEmitter<void>();
}