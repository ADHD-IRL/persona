import MarkdownContent from '@/components/ui/MarkdownContent';

export default function SynthesisDocument({text}) {
 return text ? <MarkdownContent>{text}</MarkdownContent> : null;
}
