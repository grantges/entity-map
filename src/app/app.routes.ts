import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'diagram', pathMatch: 'full' },
  {
    path: 'diagram',
    loadChildren: () =>
      import('./features/diagram/diagram.routes').then(
        (m) => m.DIAGRAM_ROUTES
      ),
  },
];
