import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
declare const console: any;

@Component({
  selector: 'app-attributes-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attributes-table.html',
  styleUrls: ['./attributes-table.css']
})
export class AttributesTable implements OnDestroy {
  features: any[] = [];
  private _sub: any;

  constructor(private layerService: LayerService, private modalService: ModalService) {
    this._sub = this.layerService.currentFeatures$.subscribe((f: any[]) => {
      this.features = f ?? [];
    });
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe?.();
  }

  async editFeature(row: any) {
    const newName = await this.modalService.prompt('Enter new name', row.attributes?.name ?? '');
    if (newName == null) return;
    const updates = [{ attributes: { objectId: row.attributes?.objectId ?? row.attributes?.OBJECTID ?? row.attributes?.id, name: newName } }];
    const url = row.layerUrl ?? row.layerUrlString ?? row.layer?.url;
    if (!url) { this.layerService.emitToast('No layer URL for this feature'); return; }
    this.layerService.applyEditsProxy(url, { updates }).subscribe({
      next: (res: any) => { this.layerService.emitToast('Feature updated'); },
      error: (err: any) => { console.error('Update failed', err); this.layerService.emitToast('Update failed'); }
    });
  }

  async deleteFeature(row: any) {
    if (!(await this.modalService.confirm('Delete this feature?'))) return;
    const id = row.attributes?.objectId ?? row.attributes?.OBJECTID ?? row.attributes?.id;
    const url = row.layerUrl ?? row.layerUrlString ?? row.layer?.url;
    if (!url) { this.layerService.emitToast('No layer URL for this feature'); return; }
    this.layerService.applyEditsProxy(url, { deletes: [id] }).subscribe({
      next: (res: any) => { this.layerService.emitToast('Feature deleted'); },
      error: (err: any) => { console.error('Delete failed', err); this.layerService.emitToast('Delete failed'); }
    });
  }
}
