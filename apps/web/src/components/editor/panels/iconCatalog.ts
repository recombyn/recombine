import type { ComponentType } from 'react';
import {
  FaEnvelope,
  FaGithub,
  FaLinkedin,
  FaPhone,
  FaGlobe,
  FaMapMarkerAlt,
  FaWeixin,
  FaQq,
  FaTwitter,
  FaYoutube,
  FaBook,
  FaBriefcase,
  FaGraduationCap,
  FaCertificate,
  FaCode,
  FaDatabase,
  FaLaptopCode,
  FaMobileAlt,
  FaServer,
  FaTools,
  FaUser,
  FaUsers,
  FaStar,
  FaHeart,
  FaLightbulb,
  FaRocket,
  FaLanguage,
  FaAward,
  FaCalendarAlt,
  FaLink,
  FaFileAlt,
  FaHome,
  FaBuilding,
  FaCloud,
  FaReact,
} from 'react-icons/fa';
import {
  SiTypescript,
  SiJavascript,
  SiPython,
  SiNodedotjs,
  SiDocker,
  SiKubernetes,
  SiGithub,
  SiGitlab,
  SiFigma,
  SiNextdotjs,
  SiVuedotjs,
} from 'react-icons/si';
import {
  HiOutlineAcademicCap,
  HiOutlineBriefcase,
  HiOutlineEnvelope,
  HiOutlineGlobeAlt,
  HiOutlinePhone,
  HiOutlineMapPin,
  HiOutlineUser,
  HiOutlineStar,
  HiOutlineLightBulb,
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlineHome,
} from 'react-icons/hi2';

export type IconCategory = 'contact' | 'social' | 'skill' | 'general';

export type IconCatalogItem = {
  id: string;
  label: string;
  keywords: string[];
  category: IconCategory;
  Icon: ComponentType<{ size?: number | string; color?: string; className?: string }>;
};

/** Curated resume-friendly icons from react-icons (Font Awesome + Simple Icons + Heroicons). */
export const ICON_CATALOG: IconCatalogItem[] = [
  { id: 'mail', label: 'Email', keywords: ['mail', 'email', '邮箱', '邮件'], category: 'contact', Icon: FaEnvelope },
  { id: 'phone', label: 'Phone', keywords: ['phone', 'tel', '电话', '手机'], category: 'contact', Icon: FaPhone },
  { id: 'globe', label: 'Website', keywords: ['web', 'site', '网站', '主页'], category: 'contact', Icon: FaGlobe },
  { id: 'map', label: 'Location', keywords: ['map', 'address', '地址', '位置'], category: 'contact', Icon: FaMapMarkerAlt },
  { id: 'user', label: 'User', keywords: ['user', 'person', '用户', '个人'], category: 'contact', Icon: FaUser },
  { id: 'home', label: 'Home', keywords: ['home', '家'], category: 'contact', Icon: FaHome },
  { id: 'building', label: 'Company', keywords: ['company', 'office', '公司'], category: 'contact', Icon: FaBuilding },
  { id: 'hi-mail', label: 'Email Outline', keywords: ['mail', '邮箱'], category: 'contact', Icon: HiOutlineEnvelope },
  { id: 'hi-phone', label: 'Phone Outline', keywords: ['phone', '电话'], category: 'contact', Icon: HiOutlinePhone },
  { id: 'hi-globe', label: 'Globe Outline', keywords: ['web', '网站'], category: 'contact', Icon: HiOutlineGlobeAlt },
  { id: 'hi-map', label: 'Pin Outline', keywords: ['map', '地址'], category: 'contact', Icon: HiOutlineMapPin },
  { id: 'hi-user', label: 'User Outline', keywords: ['user', '个人'], category: 'contact', Icon: HiOutlineUser },
  { id: 'hi-home', label: 'Home Outline', keywords: ['home'], category: 'contact', Icon: HiOutlineHome },

  { id: 'github', label: 'GitHub', keywords: ['github', 'git', '开源'], category: 'social', Icon: FaGithub },
  { id: 'si-github', label: 'GitHub Brand', keywords: ['github'], category: 'social', Icon: SiGithub },
  { id: 'gitlab', label: 'GitLab', keywords: ['gitlab'], category: 'social', Icon: SiGitlab },
  { id: 'linkedin', label: 'LinkedIn', keywords: ['linkedin', '领英'], category: 'social', Icon: FaLinkedin },
  { id: 'wechat', label: 'WeChat', keywords: ['wechat', '微信', 'weixin'], category: 'social', Icon: FaWeixin },
  { id: 'qq', label: 'QQ', keywords: ['qq'], category: 'social', Icon: FaQq },
  { id: 'twitter', label: 'X / Twitter', keywords: ['twitter', 'x'], category: 'social', Icon: FaTwitter },
  { id: 'youtube', label: 'YouTube', keywords: ['youtube', '视频'], category: 'social', Icon: FaYoutube },
  { id: 'link', label: 'Link', keywords: ['link', '链接', 'url'], category: 'social', Icon: FaLink },
  { id: 'hi-link', label: 'Link Outline', keywords: ['link', '链接'], category: 'social', Icon: HiOutlineLink },

  { id: 'react', label: 'React', keywords: ['react'], category: 'skill', Icon: FaReact },
  { id: 'next', label: 'Next.js', keywords: ['next', 'nextjs'], category: 'skill', Icon: SiNextdotjs },
  { id: 'vue', label: 'Vue', keywords: ['vue'], category: 'skill', Icon: SiVuedotjs },
  { id: 'ts', label: 'TypeScript', keywords: ['typescript', 'ts'], category: 'skill', Icon: SiTypescript },
  { id: 'js', label: 'JavaScript', keywords: ['javascript', 'js'], category: 'skill', Icon: SiJavascript },
  { id: 'python', label: 'Python', keywords: ['python'], category: 'skill', Icon: SiPython },
  { id: 'node', label: 'Node.js', keywords: ['node', 'nodejs'], category: 'skill', Icon: SiNodedotjs },
  { id: 'docker', label: 'Docker', keywords: ['docker'], category: 'skill', Icon: SiDocker },
  { id: 'k8s', label: 'Kubernetes', keywords: ['k8s', 'kubernetes'], category: 'skill', Icon: SiKubernetes },
  { id: 'figma', label: 'Figma', keywords: ['figma', '设计'], category: 'skill', Icon: SiFigma },
  { id: 'code', label: 'Code', keywords: ['code', 'coding', '代码'], category: 'skill', Icon: FaCode },
  { id: 'laptop', label: 'Laptop', keywords: ['laptop', 'dev', '开发'], category: 'skill', Icon: FaLaptopCode },
  { id: 'mobile', label: 'Mobile', keywords: ['mobile', 'app', '移动'], category: 'skill', Icon: FaMobileAlt },
  { id: 'server', label: 'Server', keywords: ['server', 'backend', '后端'], category: 'skill', Icon: FaServer },
  { id: 'database', label: 'Database', keywords: ['db', 'sql', '数据库'], category: 'skill', Icon: FaDatabase },
  { id: 'cloud', label: 'Cloud', keywords: ['cloud', '云'], category: 'skill', Icon: FaCloud },
  { id: 'tools', label: 'Tools', keywords: ['tools', '工具'], category: 'skill', Icon: FaTools },

  { id: 'briefcase', label: 'Work', keywords: ['work', 'job', '工作', '经历'], category: 'general', Icon: FaBriefcase },
  { id: 'hi-briefcase', label: 'Work Outline', keywords: ['work', '工作'], category: 'general', Icon: HiOutlineBriefcase },
  { id: 'grad', label: 'Education', keywords: ['edu', 'school', '教育', '学历'], category: 'general', Icon: FaGraduationCap },
  { id: 'hi-grad', label: 'Education Outline', keywords: ['edu', '教育'], category: 'general', Icon: HiOutlineAcademicCap },
  { id: 'book', label: 'Book', keywords: ['book', '读书'], category: 'general', Icon: FaBook },
  { id: 'cert', label: 'Certificate', keywords: ['cert', '证书'], category: 'general', Icon: FaCertificate },
  { id: 'award', label: 'Award', keywords: ['award', '奖项', '荣誉'], category: 'general', Icon: FaAward },
  { id: 'star', label: 'Star', keywords: ['star', '星'], category: 'general', Icon: FaStar },
  { id: 'hi-star', label: 'Star Outline', keywords: ['star'], category: 'general', Icon: HiOutlineStar },
  { id: 'heart', label: 'Heart', keywords: ['heart', '喜欢'], category: 'general', Icon: FaHeart },
  { id: 'bulb', label: 'Idea', keywords: ['idea', '想法', '创意'], category: 'general', Icon: FaLightbulb },
  { id: 'hi-bulb', label: 'Idea Outline', keywords: ['idea', '创意'], category: 'general', Icon: HiOutlineLightBulb },
  { id: 'rocket', label: 'Rocket', keywords: ['rocket', '启动'], category: 'general', Icon: FaRocket },
  { id: 'lang', label: 'Language', keywords: ['language', '语言'], category: 'general', Icon: FaLanguage },
  { id: 'users', label: 'Team', keywords: ['team', '团队'], category: 'general', Icon: FaUsers },
  { id: 'calendar', label: 'Calendar', keywords: ['date', '日历', '时间'], category: 'general', Icon: FaCalendarAlt },
  { id: 'file', label: 'Document', keywords: ['file', 'doc', '文档'], category: 'general', Icon: FaFileAlt },
  { id: 'hi-file', label: 'Document Outline', keywords: ['file', '文档'], category: 'general', Icon: HiOutlineDocumentText },
];

export const ICON_CATEGORIES: IconCategory[] = ['contact', 'social', 'skill', 'general'];

export function filterIconCatalog(query: string, category: IconCategory | 'all' = 'all') {
  const q = query.trim().toLowerCase();
  return ICON_CATALOG.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.id.includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}
