import { WidgetManager } from './WidgetManager';
import { HtmlWidget } from '../../components/widgets/HtmlWidget';
import { MermaidWidget } from '../../components/widgets/MermaidWidget';
import { WeatherWidget } from '../../components/widgets/WeatherWidget';
import { StandbyCardWidget } from '../../components/widgets/StandbyCardWidget';

//shared by router and overlay entries
WidgetManager.registerWidget(HtmlWidget);
WidgetManager.registerWidget(MermaidWidget);
WidgetManager.registerWidget(WeatherWidget);
//saved standby replies still render in the app
WidgetManager.registerWidget(StandbyCardWidget);
