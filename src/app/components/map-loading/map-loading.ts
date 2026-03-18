import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapStateService } from '../../services/map-state.service';

@Component({
  selector: 'app-map-loading',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    .loading-overlay {
      position: absolute; inset: 0; z-index: 9999;
      background: rgba(10, 20, 38, 0.85);
      backdrop-filter: blur(5px);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #e2e8f0; font-family: sans-serif;
    }
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: #0ea5e9; border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
  template: `
    <div class="loading-overlay" *ngIf="mapState.isLoading()">
      <div class="spinner"></div>
      <div class="loading-text">{{ mapState.loadingMessage() }}</div>
    </div>
  `
})
export class MapLoadingComponent {
  constructor(public mapState: MapStateService) {}
}