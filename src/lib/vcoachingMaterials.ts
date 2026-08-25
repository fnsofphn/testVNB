export type VcoachingMaterialListItem = {
  id: string;
  deletedAt?: string | null;
};

export function filterActiveVcoachingMaterials<T extends VcoachingMaterialListItem>(materials: T[]) {
  return materials.filter((material) => !material.deletedAt);
}

export function replaceVcoachingMaterial<T extends VcoachingMaterialListItem>(materials: T[], nextMaterial: T) {
  return materials.map((material) => (material.id === nextMaterial.id ? nextMaterial : material));
}

export function removeVcoachingMaterial<T extends VcoachingMaterialListItem>(materials: T[], materialId: string) {
  return materials.filter((material) => material.id !== materialId);
}
