import $ from 'jquery';
import * as THREE from 'three';
import Highcharts from 'highcharts';
import { MagnonCrystal } from './magnoncrystal.js';
import { MagnonHighcharts } from './magnonhighcharts.js';
import { MagnonWebpage } from './magnonwebpage.js';

if (THREE.ColorManagement) THREE.ColorManagement.enabled = false;
globalThis.Highcharts = Highcharts;

try {
    const viewer = new MagnonCrystal();
    viewer.init($('#vibcrystal'));
    const chart = new MagnonHighcharts($('#highcharts'));
    const page = new MagnonWebpage(viewer, chart, $);
    page.init();
} catch (error) {
    $('#load-status').attr('role', 'alert').addClass('error').text(`Could not start the 3D viewer: ${error.message}`);
}
