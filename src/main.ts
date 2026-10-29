import './ui/style.css';
import { startApp } from './ui/app';
import { preventZoom } from './ui/nozoom';

preventZoom();
startApp(document.getElementById('app')!);
