import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ModalRequest = {
  id: string;
  type: 'prompt' | 'confirm' | 'alert';
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
};

@Injectable({ providedIn: 'root' })
export class ModalService {
  private _requests = new Subject<ModalRequest | null>();
  requests$ = this._requests.asObservable();

  private _resolvers = new Map<string, (v: any) => void>();

  prompt(message: string, defaultValue = ''): Promise<string | null> {
    const id = String(Math.random()).slice(2);
    const req: ModalRequest = { id, type: 'prompt', message, defaultValue };
    this._requests.next(req);
    return new Promise((resolve) => {
      this._resolvers.set(id, resolve);
    });
  }

  confirm(message: string): Promise<boolean> {
    const id = String(Math.random()).slice(2);
    const req: ModalRequest = { id, type: 'confirm', message };
    this._requests.next(req);
    return new Promise((resolve) => {
      this._resolvers.set(id, resolve);
    });
  }

  alert(message: string) {
    const id = String(Math.random()).slice(2);
    const req: ModalRequest = { id, type: 'alert', message };
    this._requests.next(req);
    return new Promise<void>((resolve) => {
      this._resolvers.set(id, resolve);
    });
  }

  // called by modal component when user responds
  resolve(id: string, value: any) {
    const r = this._resolvers.get(id);
    if (r) {
      r(value);
      this._resolvers.delete(id);
    }
    // clear request
    this._requests.next(null);
  }
}
