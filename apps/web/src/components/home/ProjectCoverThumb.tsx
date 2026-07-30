import { memo, type ReactNode } from 'react';
import ProjectCoverCollage from '@/components/home/ProjectCoverCollage';

type Props = {
  /** Single URL or up to 4 cover URLs. */
  thumbnail?: string | string[] | null;
  /** Cache-bust token (updatedAt / revision). */
  version?: number | string | null;
  document?: unknown;
  className?: string;
  children?: ReactNode;
};

/**
 * Project card cover for 最近打开 / 我的项目 — multi-element collage (max 4).
 */
function ProjectCoverThumb({
  thumbnail,
  version,
  document,
  className,
  children,
}: Props): ReactNode {
  return (
    <ProjectCoverCollage
      urls={thumbnail}
      version={version}
      document={document}
      className={className}
    >
      {children}
    </ProjectCoverCollage>
  );
}

export default memo(ProjectCoverThumb);
