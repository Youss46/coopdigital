import { vi } from "vitest";

const passthrough = { parse: vi.fn((x: unknown) => x), safeParse: vi.fn((x: unknown) => ({ success: true, data: x })) };

export const CreateMembreBody = passthrough;
export const UpdateMembreBody = passthrough;
export const CreateAvanceBody = passthrough;
export const RembourserAvanceBody = passthrough;
export const CreateLivraisonBody = passthrough;
export const CreateLotBody = passthrough;
export const UpdateLotStatutBody = passthrough;
export const CreateExportateurBody = passthrough;
export const EntreeStockBody = passthrough;
export const SortieStockBody = passthrough;
export const CreateVenteBody = passthrough;
export const EncaisserVenteBody = passthrough;
export const CreateEcritureManuelleBody = passthrough;
export const UpdateConfigBody = passthrough;
export const SendSmsGroupeBody = passthrough;
export const LoginBody = passthrough;
export const CreateDocumentOfficielBody = passthrough;
