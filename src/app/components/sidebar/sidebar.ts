import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MapStateService } from '../../services/map-state.service';
import { LayerService } from '../../services/layer';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css']
})
export class SidebarComponent {
  @Output() onToggle3D = new EventEmitter<void>();
  @Output() onUploadEvent = new EventEmitter<any>();
  @Output() onAddWebLayer = new EventEmitter<void>();
  @Output() onAddKML = new EventEmitter<void>();
  @Output() onStartDrawing = new EventEmitter<'point' | 'polyline' | 'polygon'>();
  @Output() onCancelDrawing = new EventEmitter<void>();

  constructor(
    private router: Router, 
    public mapState: MapStateService,
    private layerService: LayerService
  ) {}

  goToFiles() {
    this.router.navigate(['/files']);
  }

  onUpload(event: any) {
    this.onUploadEvent.emit(event);
  }

  toggleDraw(type: 'point' | 'polyline' | 'polygon') {
    if (this.mapState.drawType() === type) {
      this.cancelDraw();
    } else {
      this.mapState.setDrawingMode(true, type);
      this.layerService.emitToast(`Drawing mode initiated: ${type}`);
      this.onStartDrawing.emit(type);
    }
  }

  cancelDraw() {
    this.mapState.setDrawingMode(false, null);
    this.onCancelDrawing.emit();
  }
}