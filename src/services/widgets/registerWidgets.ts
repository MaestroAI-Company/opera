import { WidgetManager } from './WidgetManager';
import { MapsWidget } from '../../components/widgets/MapsWidget';
import { HtmlWidget } from '../../components/widgets/HtmlWidget';
import { MermaidWidget } from '../../components/widgets/MermaidWidget';

//shared by router and overlay entries
WidgetManager.registerWidget(MapsWidget);
WidgetManager.registerWidget(HtmlWidget);
WidgetManager.registerWidget(MermaidWidget);
