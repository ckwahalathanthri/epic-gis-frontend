import { Component } from '@angular/core';
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
  constructor(
    private router: Router, 
    public mapState: MapStateService,
    private layerService: LayerService
  ) {}

  goToFiles() {
    this.router.navigate(['/files']);
  }

  onUpload(event: any) {
    // You will route this later to the map.ts logic or layerService directly
    const file = event.target?.files?.[0];
    if (file) {
      this.layerService.emitToast('Upload triggered for ' + file.name + ' (Routing logic to be attached)');
    }
  }

  toggleDraw(type: 'point' | 'polyline' | 'polygon') {
    if (this.mapState.drawType() === type) {
      this.cancelDraw();
    } else {
      this.mapState.setDrawingMode(true, type);
      this.layerService.emitToast(`Drawing mode initiated: ${type}`);
      // In Phase 2, we will tell ArcMap to actually begin drawing here
    }
  }

  cancelDraw() {
    this.mapState.setDrawingMode(false, null);
    // In Phase 2, we will send an abort command to the Sketch widget here
  }
}