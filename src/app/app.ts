import { Component, signal, ViewChild, NgZone } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { LayerService } from './services/layer';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { MapComponent } from './gis/map/map';
import { CesiumMapComponent } from './gis/cesium-map/cesium-map';
import { ToolsPanel } from "./components/tools-panel/tools-panel";
import { AttributesTable } from './components/attributes-table/attributes-table';
import { AppModal } from './components/app-modal/app-modal';
declare const window: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MapComponent,
    CesiumMapComponent,
    ToolsPanel,
    AttributesTable,
    AppModal,
    RouterOutlet
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnDestroy {
  protected readonly title = signal('gis-frontend');
  @ViewChild(MapComponent) private mapComp?: MapComponent;
  // when true, show Cesium-based viewer instead of ArcGIS MapComponent
  useCesium = false;
  is3D = false;
  showUploadPanel = false;
  // Layer toggles state
  forestEnabled = false;
  seismicEnabled = false;
  buildingsEnabled = false;
  toastMessage = '';
  private _toastTimer: any = null;
  private _subs: any[] = [];

  constructor(private layerService: LayerService, private router: Router, private ngZone: NgZone) {
    // subscribe to layer added notifications to show toast
    const sub = this.layerService.layerAdded$.subscribe((url: string) => {
      this.ngZone.run(() => {
        this.showToast('Layer added: ' + url);
      });
    });
    this._subs.push(sub);
    // subscribe to generic toasts from services
    const sub2 = this.layerService.toast$.subscribe((m: string) => { console.log('[AppComponent] toast$ received:', m);
      this.ngZone.run(() => { this.showToast(m); 
      }); 
    });
    this._subs.push(sub2);
  }

  toggleUploadPanel() {
    this.showUploadPanel = !this.showUploadPanel;
  }

  toggle3D() {
    this.is3D = !this.is3D;
    this.mapComp?.setViewMode(this.is3D ? '3d' : '2d');
  }

  toggleCesium() {
    this.useCesium = !this.useCesium;
  }

  openSettings() {
    // placeholder: open a simple prompt for settings
    const url = window.prompt('Enter SceneLayer URL to use for 3D buildings (leave blank to keep default):', this.mapComp?.getSceneLayerUrl() ?? '');
    if (url != null && this.mapComp) {
      this.mapComp.setSceneLayerUrl(url || null);
    }
  }

  openNotifications() {
    window.alert('No notifications');
  }

  openProfile() {
    window.alert('Profile menu (not implemented)');
  }

  // Right-toolbar actions delegated to MapComponent
  addFeatureLayer() { this.mapComp?.addFeatureLayer(); }
  startDraw() { this.mapComp?.startSketch(); }
  addPin() { this.mapComp?.addPinAtCenter(); }
  addEnterpriseBasemap() { this.mapComp?.addEnterpriseBasemap(); }
  clearUserLayers() { this.mapComp?.clearUserLayers(); }
  
  toggleForest(enabled: boolean) {
    this.forestEnabled = !!enabled;
    this.mapComp?.toggleForestDensity(this.forestEnabled);
  }

  toggleSeismic(enabled: boolean) {
    this.seismicEnabled = !!enabled;
    this.mapComp?.toggleSeismicActivity(this.seismicEnabled);
  }

  toggleBuildings(enabled: boolean) {
    this.buildingsEnabled = !!enabled;
    this.mapComp?.toggleBuildingFootprints(this.buildingsEnabled);
  }

  showToast(msg: string) {
    console.log('[AppComponent] showToast called, toastMessage =', msg);
    this.toastMessage = msg;
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => { this.toastMessage = ''; this._toastTimer = null; }, 4000);
  }

  ngOnDestroy(): void {
    this._subs.forEach(s => s.unsubscribe && s.unsubscribe());
  }

  get showMap() {
    return this.router.url === '/' || this.router.url.startsWith('/?');
  }

  goToFiles() {
    this.router.navigate(['/files']);
  }

  // --- Navigate back to Map ---
  goToMap() {
    this.router.navigate(['/']);
  }
}
