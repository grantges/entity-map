import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ParseResult } from '../models/entity.model';

export interface ParseProgress {
  progress?: number;
  result?: ParseResult;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MetadataParserService {
  private worker: Worker | null = null;

  readonly parsing = signal(false);
  readonly progress = signal(0);

  parseXml(xmlString: string): Observable<ParseResult> {
    const subject = new Subject<ParseResult>();

    this.parsing.set(true);
    this.progress.set(0);

    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../workers/metadata-parser.worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = ({ data }: MessageEvent<ParseProgress>) => {
        if (data.progress !== undefined) {
          this.progress.set(data.progress);
        }
        if (data.result) {
          this.parsing.set(false);
          this.progress.set(100);
          subject.next(data.result);
          subject.complete();
          this.worker?.terminate();
          this.worker = null;
        }
        if (data.error) {
          this.parsing.set(false);
          subject.error(new Error(data.error));
          this.worker?.terminate();
          this.worker = null;
        }
      };

      this.worker.onerror = (err) => {
        this.parsing.set(false);
        subject.error(new Error('Worker error: ' + err.message));
        this.worker?.terminate();
        this.worker = null;
      };

      this.worker.postMessage(xmlString);
    } else {
      this.parsing.set(false);
      subject.error(new Error('Web Workers are required to parse metadata. Please use a modern browser.'));
    }

    return subject.asObservable();
  }

  parseFile(file: File): Observable<ParseResult> {
    const subject = new Subject<ParseResult>();

    const reader = new FileReader();
    reader.onload = () => {
      this.parseXml(reader.result as string).subscribe({
        next: (result) => {
          subject.next(result);
          subject.complete();
        },
        error: (err) => subject.error(err),
      });
    };
    reader.onerror = () => {
      subject.error(new Error('Failed to read file'));
    };
    reader.readAsText(file);

    return subject.asObservable();
  }
}
