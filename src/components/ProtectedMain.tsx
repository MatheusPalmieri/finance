import { type ComponentProps, memo } from 'react';

import { Header } from './Header';

interface ProtectedMainProps extends ComponentProps<'main'> {
  title: string;
}

export const ProtectedMain = memo<ProtectedMainProps>(({ title, ...props }) => {
  return (
    <>
      <Header title={title} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <main
            className="flex flex-col gap-4 py-4 md:gap-6 md:py-6"
            {...props}
          />
        </div>
      </div>
    </>
  );
});
ProtectedMain.displayName = 'ProtectedMain';
