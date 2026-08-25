import { SectionHeader } from '@/components/ui/Primitives';
import { ProductionPlanningPage } from '@/pages/ProductionPlanningPage';
import type { PageKey } from '@/data/vcontent';

const CONFIGS: Record<'smf00' | 'vsmf00', { module: 'ELN' | 'VIDEO'; eye: string; title: string; subtitle: string }> = {
  smf00: {
    module: 'ELN',
    eye: 'Module 2 · SMF-00',
    title: 'Danh mục đơn hàng E-learning',
    subtitle: 'Màn tổng hợp đơn hàng rút gọn từ tab Kế hoạch sản xuất trước khi đi vào SMF-01.',
  },
  vsmf00: {
    module: 'VIDEO',
    eye: 'Module 3 · VSMF-00',
    title: 'Danh mục đơn hàng Video học liệu',
    subtitle: 'Màn tổng hợp đơn hàng rút gọn từ tab Kế hoạch sản xuất trước khi đi vào VSMF-01.',
  },
};

export function ModuleCatalogPage({ pageId }: { pageId: PageKey }) {
  const config = CONFIGS[pageId as 'smf00' | 'vsmf00'];

  return (
    <>
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />
      <ProductionPlanningPage moduleFilter={config.module} hideTypeColumn showCheckpointColumn compactCatalog />
    </>
  );
}
