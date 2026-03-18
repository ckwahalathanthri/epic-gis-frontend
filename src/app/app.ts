import { Component, signal, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { LayerService } from './services/layer';
import { RouterOutlet, Router, NavigationEnd} from '@angular/router';
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
  showMapProperty = true; 

  constructor(private layerService: LayerService, private router: Router, private ngZone: NgZone, private cdr: ChangeDetectorRef) {
    // subscribe to layer added notifications to show toast
    const sub = this.layerService.layerAdded$.subscribe((url: string) => {
      this.ngZone.run(() => {
        this.showToast('Layer added: ' + url);
      });
    });
    this._subs.push(
      this.router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.ngZone.run(() => {
            this.showMapProperty = event.url === '/' || event.url.startsWith('/?');
            this.cdr.detectChanges(); // Force UI update
          });
        }
      })
    );

    this.showMapProperty = this.router.url === '/' || this.router.url.startsWith('/?');

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
    // Call our newly abstracted map.ts toggle function
    this.mapComp?.toggle3D();
  }

  toggleCesium() {
    this.useCesium = !this.useCesium;
  }

  openSettings() {
    // placeholder: open a simple prompt for settings
    window.alert('Settings panel under construction');
  }

  openNotifications() {
    window.alert('No notifications');
  }

  openProfile() {
    window.alert('Profile menu (not implemented)');
  }

  // Right-toolbar actions delegated to MapComponent
  addFeatureLayer() { this.mapComp?.addFeatureLayer(); }
  startDraw() { window.alert('Sketch functionality was fully migrated. Please implement UI sketch hook.'); }
  addPin() { window.alert('Pin drops in development.'); }
  addEnterpriseBasemap() { this.mapComp?.addEnterpriseBasemap(); }
  clearUserLayers() { window.alert('Clear layers not implemented yet.'); }
  
  toggleForest(enabled: boolean) {
    this.forestEnabled = !!enabled;
    // MapCoreService holds the layers now if implemented
  }

  toggleSeismic(enabled: boolean) {
    this.seismicEnabled = !!enabled;
  }

  toggleBuildings(enabled: boolean) {
    this.buildingsEnabled = !!enabled;
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
    return this.showMapProperty;
  }

  goToFiles() {
    this.router.navigate(['/files']);
  }

  // --- Navigate back to Map ---
  goToMap() {
    this.router.navigate(['/']);
  }
}