import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
import { FormsModule } from '@angular/forms';
import { MapStateService } from '../../services/map-state.service';
import { MapCoreService } from '../../services/map-core.service';
import { MapToolbarComponent } from '../../components/map-toolbar/map-toolbar.component';
import { MapPopupComponent } from '../../components/map-popup/map-popup.component';
import { MapEditPanelComponent } from '../../components/map-edit-panel/map-edit-panel.component';
import { MapLoadingComponent } from '../../components/map-loading/map-loading';
import Graphic from '@arcgis/core/Graphic';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, MapToolbarComponent, MapPopupComponent, MapEditPanelComponent, MapLoadingComponent],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements OnInit, OnDestroy {
  private clickHandle: any = null;
  private editingGraphic: Graphic | null = null;
  private backendLayerSubscription: any = null;

  constructor(
    private layerService: LayerService,
    private modalService: ModalService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    public mapState: MapStateService,
    public mapCore: MapCoreService
  ) {}

  ngOnInit(): void {
    this.mapCore.initMap('mapViewDiv');
    
    // Setup hit testing logic once view is ready
    this.mapCore.view.when(() => {
      this.mapCore.addDefaultWidgets();
      this.setupPopupHandler();
    });

    this.backendLayerSubscription = this.layerService.layerAdded$.subscribe({
      next: (url: string) => {
        try { this.mapCore.addFeatureLayerFromUrl(url); }
        catch {
          try { this.mapCore.addKML(url); } 
          catch (err) { console.error('Failed to add uploaded layer', err); }
        }
      }
    });

    this.loadBackendLayers();
  }

  ngOnDestroy(): void {
    this.clickHandle?.remove();
    this.backendLayerSubscription?.unsubscribe();
    this.mapCore.view?.destroy();
  }

  // ── Actions Triggered from UI ─────────────────────────────────────────────

  toggle3D(): void {
    this.mapState.toggle3DMode();
    this.mapCore.switchMode(this.mapState.is3DMode()).then(() => {
      this.setupPopupHandler(); // Reattach handler to the new view
    });
  }

  async addEnterpriseBasemap(): Promise<void> {
    const url = await this.modalService.prompt('Enter ArcGIS Enterprise URL:');
    if (url) this.mapCore.addBasemap(url);
  }

  async addFeatureLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter Feature Layer URL:');
    if (url) this.mapCore.addFeatureLayerFromUrl(url, (feats) => this.layerService.setCurrentFeatures(feats));
  }

  async addKMLLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter KML URL:');
    if (url) this.mapCore.addKML(url);
  }

  uploadFile(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    this.layerService.uploadLayer(file, file.name).subscribe({
      next: (res: any) => {
        if (!res?.id) return;
        this.layerService.getLayerGeoJson(res.id).subscribe({
          next: (geoJson: any) => {
            const layer = this.mapCore.addGeoJsonLayerToMap(geoJson, res.layerName, res.id, this.mapState.is3DMode());
            layer?.when(() => {
              if (layer.fullExtent) this.mapCore.view.goTo(layer.fullExtent).catch((e: any) => console.warn(e));
            });
          }
        });
      },
      error: (err: any) => console.error('Upload failed', err)
    });
  }

  // ── Editing Features ──────────────────────────────────────────────────────

  openEditFromPopup(): void {
    const graphic = this.mapState.popupGraphic();
    const backendLayerId = this.mapState.popupBackendLayerId();
    if (!graphic || !backendLayerId) return;

    const attrs = graphic.attributes ?? {};
    const featureId = attrs.F_db_id ?? attrs._db_id ?? null;

    const mappedProps = Object.entries(attrs)
      .filter(([key]) => !key.startsWith('F_') && !key.startsWith('_') && key !== 'OBJECTID' && key !== 'ObjectID')
      .map(([key, value]) => ({ key, value: String(value ?? '') }));

    this.mapState.openEditPanel(featureId, backendLayerId, mappedProps);
    this.editingGraphic = this.mapCore.startGeometryEdit(graphic);
    
    try { this.mapCore.view.popup?.close(); } catch { /* ignore */ }
  }

  cancelEdit(): void {
    this.mapState.closeEditPanel();
    this.mapCore.cancelEditSession();
    this.editingGraphic = null;
  }

  saveFeature(): void {
    const featureId = this.mapState.editingFeatureId();
    const layerId = this.mapState.editingLayerId();
    
    if (!featureId || !layerId || this.mapState.isSaving()) return;
    this.mapState.setSaving(true);

    const properties: Record<string, string> = {};
    this.mapState.editProperties().forEach(p => { properties[p.key] = p.value; });

    const geojsonGeometry = this.editingGraphic?.geometry
      ? this.mapCore.convertToGeoJson(this.editingGraphic.geometry)
      : null;

    this.layerService.updateFeature(layerId, featureId, properties, geojsonGeometry).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.mapState.setSaveSuccess(true);
          this.cancelEdit();
          this.layerService.emitToast('✅ Feature saved successfully!');
          this.refreshSingleGeoJsonLayer(layerId);
          this.cdr.detectChanges();
        });
      },
      error: (err: any) => {
        this.ngZone.run(() => {
          console.error('Save failed', err);
          this.layerService.emitToast('❌ Save failed. Please try again.');
          this.mapState.setSaving(false);
          this.cdr.detectChanges();
        });
      }
    });
  }

  private refreshSingleGeoJsonLayer(backendLayerId: string): void {
    const oldLayer = this.mapCore.removeLayerByBackendId(backendLayerId);
    if (!oldLayer) return;

    this.layerService.getLayerGeoJson(backendLayerId).subscribe({
      next: (geoJson: any) => {
        this.ngZone.run(() => {
          this.mapCore.addGeoJsonLayerToMap(geoJson, oldLayer.title, backendLayerId, this.mapState.is3DMode());
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ── Hit Testing Internal Event ────────────────────────────────────────────

  private setupPopupHandler(): void {
    if (!this.mapCore.view) return;
    this.clickHandle?.remove();

    this.clickHandle = this.mapCore.view.on('click', (event: any) => {
      this.mapCore.hitTestLayers(event).then(response => {
        const hit = (response?.results ?? []).find((r: any) => r.type === 'graphic');

        this.ngZone.run(() => {
          if (!hit) {
            this.mapState.closeFeaturePopup();
          } else {
            const graphic = hit.graphic;
            const attrs = graphic.attributes ?? {};
            const owningLayer = graphic.layer;
            const backendLayerId = (owningLayer as any)?._backendLayerId ?? null;
            const featureName = attrs.name || attrs.NAME || owningLayer?.title || 'Feature';

            const mappedAttrs = Object.entries(attrs)
              .filter(([key]) => !key.startsWith('F_') && !key.startsWith('_') && key !== 'OBJECTID' && key !== 'ObjectID')
              .map(([key, value]) => ({ key, value: String(value ?? '') }));

            this.mapState.openFeaturePopup(featureName, mappedAttrs, graphic, backendLayerId);
          }
          this.cdr.detectChanges();
        });
      }).catch(err => {
        if (err?.name !== 'AbortError') console.warn('hitTest error:', err);
      });
    });
  }

    // ── Backend Loading ────────────────────────────────────────────

  private loadBackendLayers(): void {
    this.layerService.listLayers().subscribe({
      next: (layers: any) => {
        if (!layers) return;
        const items = Array.isArray(layers) ? layers : (layers.items ?? layers);
        
        for(const l of items) {
          if (l.url && typeof l.url === 'string') {
            try { this.mapCore.addFeatureLayerFromUrl(l.url); } catch { /* ignore */ }
          } else if (l.id) {
            this.layerService.getGeoJson(l.id).subscribe({
              next: (g: any) => {
                if (g?.type === 'FeatureCollection') {
                  this.mapCore.addGeoJsonLayerToMap(g, l.name ?? `layer-${l.id}`, l.id, this.mapState.is3DMode());
                } else if (g?.url) {
                  // Pass url-based GeoJSON layers down to our core service utility
                  this.mapCore.addGeoJsonLayerFromUrl(g.url, l.name ?? `layer-${l.id}`);
                }
              }
            });
          }
        }
      }
    });
  }
}