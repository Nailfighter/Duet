'use client';

import React from 'react';
import type { AppConfig } from '@/app-config';
import { SplitScreenLayout } from '@/components/app/split-screen-layout';

interface SessionViewProps {
  appConfig: AppConfig;
}

export const SessionView = ({
  appConfig,
  ...props
}: React.ComponentProps<'section'> & SessionViewProps) => {
  return (
    <section className="h-full w-full" {...props}>
      <SplitScreenLayout />
    </section>
  );
};
