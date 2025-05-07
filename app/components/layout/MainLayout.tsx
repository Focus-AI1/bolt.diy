import React from 'react';
import { Header } from '~/components/header/Header';
import styles from './MainLayout.module.scss';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className={styles.MainLayout}>
      {/* Fixed header that stays in place */}
      <div className={styles.HeaderContainer}>
        <Header />
      </div>
      
      {/* Scrollable content area */}
      <div className={styles.ContentContainer}>
        {children}
      </div>
    </div>
  );
}

// We need to see how the components are structured in the layout
// This file likely contains both Header and BaseChat in a parent-child relationship 