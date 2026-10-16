import { Inject, Injectable } from '@nestjs/common';
import type { ProveedorIa } from '@nv/shared';
import { ProveedorAnthropic } from './anthropic.proveedor.js';
import { ProveedorOllama } from './ollama.proveedor.js';
import type { ProveedorAsistente } from './proveedor.js';
import { ProveedorSandboxIa } from './sandbox.proveedor.js';

/** Los motores disponibles por nombre. */
@Injectable()
export class RegistroProveedoresIa {
  constructor(
    @Inject(ProveedorOllama) readonly local: ProveedorOllama,
    @Inject(ProveedorAnthropic) readonly claude: ProveedorAnthropic,
    @Inject(ProveedorSandboxIa) readonly sandbox: ProveedorSandboxIa,
  ) {}

  de(proveedor: ProveedorIa): ProveedorAsistente {
    return this[proveedor];
  }
}
