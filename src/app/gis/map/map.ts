import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
import { FormsModule } from '@angular/forms';
import { MapStateService } from '../../services/map-state.service';
import { MapCoreService } from '../../services/map-core.service';
import { MapPopupComponent } from '../../components/map-popup/map-popup.component';
import { MapEditPanelComponent } from '../../components/map-edit-panel/map-edit-panel.component';
import { MapLoadingComponent } from '../../components/map-loading/map-loading';
import { ActivatedRoute } from '@angular/router';
import Graphic from '@arcgis/core/Graphic';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, MapPopupComponent, MapEditPanelComponent, MapLoadingComponent],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements OnInit, OnDestroy {
  private clickHandle: any = null;
  private editingGraphic: Graphic | null = null;
  private backendLayerSubscription: any = null;
  private viewedLayerId: string | null = null;

  constructor(
    private layerService: LayerService,
    private modalService: ModalService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    public mapState: MapStateService,
    public mapCore: MapCoreService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.mapCore.initMap('mapViewDiv');
    
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

    this.route.queryParams.subscribe(params => {
      const layerId = params['layer'];
      
      // Destroy layers or clear view if migrating between layers using back button
      this.mapCore.view.map.removeAll(); 

      if (layerId) {
         // You can formulate logic here to specifically fetch/load `layerId`
         this.viewedLayerId = layerId;
         this.loadBackendLayers(this.viewedLayerId);
      } else {
         // Load normal map bounds
         this.viewedLayerId = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.clickHandle?.remove();
    this.backendLayerSubscription?.unsubscribe();
    this.mapCore.view?.destroy();
  }

    toggle3D(): void {
    this.mapState.toggle3DMode();
    const is3d = this.mapState.is3DMode();

    // 1. Remove all dynamically added backend layers before switching
    const layersToRemove = this.mapCore.userLayers.filter((l: any) => l._backendLayerId);
    layersToRemove.forEach(l => {
      this.mapCore.map.remove(l);
      if (l._blobUrl) URL.revokeObjectURL(l._blobUrl);
    });
    this.mapCore.userLayers = this.mapCore.userLayers.filter((l: any) => !l._backendLayerId);

    // 2. Switch maps and reload layers
    this.mapCore.switchMode(is3d).then(() => {
      this.setupPopupHandler();
      // Reload layers into the new view (MVT if 2D, GeoJSON if 3D)
      this.loadBackendLayers(this.viewedLayerId);
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

    this.mapState.startLoading('Uploading and processing layer...');
    
    this.layerService.uploadLayer(file, file.name).subscribe({
      next: (res: any) => {
        if (!res?.id) { this.mapState.stopLoading(); return; }
        
        this.mapState.startLoading('Drawing layer on map...');
        try {
          const layer = this.mapCore.addVectorTileLayerToMap(res.id, res.layerName);
          if (layer) {
            this.mapCore.view.whenLayerView(layer).then(() => {
               // VectorTileLayers do not reliably have a fullExtent natively calculable instantly from initialization like GeoJSON.
               // It's possible to hit the REST endpoint or zoom to max, but for now we'll just draw it.
               this.mapState.stopLoading();
               this.cdr.detectChanges();
            }).catch(() => {
                this.mapState.stopLoading();
            });
          } else {
              this.mapState.stopLoading();
          }
        } catch (e) {
            this.mapState.stopLoading();
        }
      },
      error: (err: any) => {
        console.error('Upload failed', err);
        this.mapState.stopLoading();
      }
    });
  }

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
    this.mapState.startLoading('Saving feature updates...');

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
        });
      },
      error: (err: any) => {
        this.ngZone.run(() => {
          console.error('Save failed', err);
          this.layerService.emitToast('❌ Save failed. Please try again.');
          this.mapState.setSaving(false);
          this.mapState.stopLoading();
          this.cdr.detectChanges();
        });
      }
    });
  }

    private refreshSingleGeoJsonLayer(backendLayerId: string): void {
    const oldLayer = this.mapCore.removeLayerByBackendId(backendLayerId);
    if (!oldLayer) {
        this.mapState.stopLoading();
        return;
    }

    this.mapState.startLoading('Refreshing map data...');
        try {
      // ALWAYS load as GeoJSON to ensure hitTest and popups continue working
      this.layerService.getLayerGeoJson(backendLayerId).subscribe({
        next: (geoJson: any) => {
          const is3d = this.mapState.is3DMode();
          // Force it to load via addGeoJsonLayerToMap regardless of 2D/3D
          const layer = this.mapCore.addGeoJsonLayerToMap(geoJson, oldLayer.title, backendLayerId, is3d);
          
          if (layer) {
            this.mapCore.view.whenLayerView(layer).then(() => {
              this.mapState.stopLoading();
              this.cdr.detectChanges();
            }).catch(() => this.mapState.stopLoading());
          } else {
            this.mapState.stopLoading();
          }
        },
        error: (err) => {
          console.error("Failed to refresh layer geometry", err);
          this.mapState.stopLoading();
        }
      });
    } catch (e) {
      this.mapState.stopLoading();
    }
  }

  private setupPopupHandler(): void {
    if (!this.mapCore.view) return;
    this.clickHandle?.remove();

    this.clickHandle = this.mapCore.view.on('click', (event: any) => {
      if (this.mapState.isDrawingMode()) return;

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

  private loadBackendLayers(targetLayerId?: string | null): void {
    // If no targetLayerId is provided, don't load anything by default
    if (!targetLayerId) {
      return;
    }

    this.mapState.startLoading('Loading backend layers...');
    this.layerService.listLayers().subscribe({
      next: (layers: any) => {
        if (!layers) {
            this.mapState.stopLoading();
            return;
        }
        
        let items = Array.isArray(layers) ? layers : (layers.items ?? layers);

        if (targetLayerId) {
            items = items.filter((l: any) => l.id === targetLayerId);
        }
        
        if (!items || items.length === 0) {
            this.mapState.stopLoading();
            return;
        }

        let layersToLoad = 0;
        let layersLoaded = 0;

        const checkAllLoaded = () => {
            layersLoaded++;
            if (layersLoaded >= layersToLoad) {
                this.mapState.stopLoading();
                this.cdr.detectChanges();
            }
        };

        for(const l of items) {
          if (l.url && typeof l.url === 'string') {
            try { 
                layersToLoad++;
                const layer = this.mapCore.addFeatureLayerFromUrl(l.url);
                if (layer) {
                    this.mapCore.view.whenLayerView(layer).then(checkAllLoaded).catch(checkAllLoaded);
                } else {
                    checkAllLoaded();
                }
            } catch { checkAllLoaded(); }
          } else if (l.id) {
            layersToLoad++;
            try {
              const layerTitle = l.name ?? `layer-${l.id}`;
              
              // Instead of conditionally splitting by Vector Tiles vs GeoJSON,
              // always fetch as GeoJSON to guarantee custom user drawings load.
              // ArcGIS is extremely fast rendering GeoJSON out-of-the-box anyway.
              this.layerService.getLayerGeoJson(l.id).subscribe({
                next: (geoJson: any) => {
                  const is3d = this.mapState.is3DMode();
                  const layer = this.mapCore.addGeoJsonLayerToMap(geoJson, layerTitle, l.id, is3d);
                  if (layer) {
                    this.mapCore.view.whenLayerView(layer).then(() => {
                       // Optional: once loaded, zoom to its extent if it's a specific viewed layer
                       if (targetLayerId === l.id && geoJson?.features?.length > 0) {
                           this.mapCore.view.goTo(layer.fullExtent || layer).catch(() => {});
                       }
                       checkAllLoaded();
                    }).catch(checkAllLoaded);
                  } else {
                    checkAllLoaded();
                  }
                },
                error: () => checkAllLoaded()
              });
            } catch { checkAllLoaded(); }
          }
        }
        
        if (layersToLoad === 0) {
            this.mapState.stopLoading();
        }
      },
      error: () => this.mapState.stopLoading()
    });
  }

    startDrawingSession(type: 'point' | 'polyline' | 'polygon' | 'freehand-polygon'): void {
    // 1. Tell ArcGIS to start drawing
    this.mapCore.startDrawing(type, (geoJsonGeometry) => {
      this.mapState.setDrawingMode(false, null); // Stop UI spin

      this.mapCore.cancelEditSession();

      if (!geoJsonGeometry) return; // User cancelled

      // 2. Decide how to save based on if we are viewing a layer or starting fresh
      if (this.viewedLayerId) {
        // Appending to an existing viewed dataset
        this.saveFeatureToExistingFile(this.viewedLayerId, geoJsonGeometry);
      } else {
        // We aren't viewing a specific file; mock an upload to create a new file
        this.saveGeometryAsNewFile(type, geoJsonGeometry);
      }
    });
  }

    deleteFeatureFromPopup(): void {
    const graphic = this.mapState.popupGraphic();
    const backendLayerId = this.mapState.popupBackendLayerId();
    if (!graphic || !backendLayerId) return;

    const attrs = graphic.attributes ?? {};
    const featureId = attrs.F_db_id ?? attrs._db_id ?? null;

    if (!featureId) {
      this.layerService.emitToast('❌ Cannot delete. No database ID found.');
      return;
    }

    if (!confirm('Are you sure you want to permanently delete this item?')) return;

    this.mapState.startLoading('Deleting feature...');
    this.layerService.deleteFeature(backendLayerId, featureId).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.mapState.closeFeaturePopup();
          this.layerService.emitToast('✅ Feature deleted successfully!');
          this.refreshSingleGeoJsonLayer(backendLayerId);
        });
      },
      error: (err: any) => {
        this.ngZone.run(() => {
          console.error('Delete failed', err);
          this.layerService.emitToast('❌ Delete failed.');
          this.mapState.stopLoading();
        });
      }
    });
  }

  private saveFeatureToExistingFile(layerId: string, geometry: any) {
    if (!confirm('Would you like to save this new shape to the currently viewed dataset?')) return;
    
    // 1. Gather custom properties from the user via prompts
    const featureName = prompt('Enter a Name for this feature:', 'New Geometry') || 'New Geometry';
    let heightVal = 20;
    let floorsVal = 1;

    if (geometry.type === 'Polygon' || geometry.type === 'polygon' || geometry.type === 'MultiPolygon' || geometry.type === 'multipolygon') {
      const f = prompt('Enter number of floors:', '1');
      if (f && !isNaN(Number(f)) && Number(f) > 0) {
        floorsVal = Number(f);
        heightVal = floorsVal * 3; // Calculate total approximate height based on floors (3m per floor)
      } else {
        const h = prompt('Enter Building Height (meters):', '20');
        if (h && !isNaN(Number(h))) {
          heightVal = Number(h);
        }
      }
    }

    const properties = { 
      name: featureName,
      height: heightVal, // <--- Custom height being saved to the database!
      floors: floorsVal
    };

    this.mapState.startLoading('Saving feature to existing layer...');
    
    // 2. Post to the backend (Your backend addFeature maps this dynamically to JSONB)
    this.layerService.addFeatureToLayer(layerId, geometry, properties).subscribe({
      next: () => {
        this.mapState.stopLoading();
        this.layerService.emitToast('✅ Attached to current file successfully!');
        this.refreshSingleGeoJsonLayer(layerId); // 3. Auto-refreshes the layer!
      },
      error: () => {
        this.mapState.stopLoading();
        this.layerService.emitToast('❌ Failed to save feature.');
      }
    });
  }

    private saveGeometryAsNewFile(type: string, geometry: any) {
    const fileName = prompt('Enter a name for your NEW spatial file:', `Drawn_${type}_${Date.now()}`);
    if (!fileName) return;

    

    let heightVal = 20;
    let floorsVal = 1;
    if (type === 'polygon' || type === 'freehand-polygon' || geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      const f = prompt('Enter number of floors:', '1');
      if (f && !isNaN(Number(f)) && Number(f) > 0) {
        floorsVal = Number(f);
        heightVal = floorsVal * 3; // Calculate total approximate height based on floors
      } else {
        const h = prompt('Enter Building Height (meters):', '20');
        if (h && !isNaN(Number(h))) {
          heightVal = Number(h);
        }
      }
    }

    // Convert the isolated GeoJSON feature into a fully standard GeoJSON file map
    const featureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: fileName, height: heightVal, floors: floorsVal }, 
        geometry: geometry
      }]
    };

    // Convert to a File Blob just like standard frontend upload tools
    const blob = new Blob([JSON.stringify(featureCollection)], { type: 'application/json' });
    const fakeFile = new File([blob], `${fileName}.geojson`, { type: 'application/geo+json' });

    this.mapState.startLoading('Creating new map layer...');
    
    // Leverage your existing perfect file-upload pipeline!
    this.layerService.uploadLayer(fakeFile, fileName).subscribe({
      next: (res: any) => {
        this.layerService.emitToast('✅ Created new layer successfully!');
        
        // Render directly instead of relying on listLayers() which might be delayed
        const layerId = res.id;
        const layerTitle = res.layerName || fileName;
        this.viewedLayerId = layerId;
        window.history.replaceState(null, '', `?layer=${layerId}`);
        const is3d = this.mapState.is3DMode();

        if (this.mapState.is3DMode()) {
          // In 3D mode, fetch the GeoJSON to utilize the 3D 'extrude' render algorithms
          this.layerService.getLayerGeoJson(layerId).subscribe({
            next: (geoJson: any) => {
              const layer = this.mapCore.addGeoJsonLayerToMap(geoJson, layerTitle, layerId, true);
              if (layer) {
                this.mapCore.view.whenLayerView(layer).then(() => {
                  this.mapState.stopLoading();
                  this.cdr.detectChanges();
                }).catch(() => this.mapState.stopLoading());
              } else {
                this.mapState.stopLoading();
              }
            },
            error: () => this.mapState.stopLoading()
          });
        } else {
          // In 2D mode, use the fast vector tiles
          const layer = this.mapCore.addVectorTileLayerToMap(layerId, layerTitle);
          if (layer) {
            this.mapCore.view.whenLayerView(layer).then(() => {
              this.mapState.stopLoading();
              this.cdr.detectChanges();
            }).catch(() => this.mapState.stopLoading());
          } else {
            this.mapState.stopLoading();
          }
        }
      },
      error: () => {
        this.mapState.stopLoading();
        this.layerService.emitToast('❌ Failed to create new layer.');
      }
    });
  }
}