import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalService, ModalRequest } from '../../services/modal.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app-modal.html',
  styleUrls: ['./app-modal.css']
})
export class AppModal implements OnDestroy {
  visible = false;
  request: ModalRequest | null = null;
  value = '';
  sub: Subscription;

  constructor(private modal: ModalService) {
    this.sub = this.modal.requests$.subscribe((r) => {
      this.request = r;
      this.visible = !!r;
      this.value = r?.defaultValue ?? '';
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  ok() {
    if (!this.request) return;
    if (this.request.type === 'prompt') this.modal.resolve(this.request.id, this.value);
    else if (this.request.type === 'confirm' || this.request.type === 'alert') this.modal.resolve(this.request.id, true);
    this.close();
  }

  cancel() {
    if (!this.request) return;
    if (this.request.type === 'prompt') this.modal.resolve(this.request.id, null);
    else if (this.request.type === 'confirm') this.modal.resolve(this.request.id, false);
    this.close();
  }

  close() {
    this.visible = false;
    this.request = null;
    this.value = '';
  }
}
