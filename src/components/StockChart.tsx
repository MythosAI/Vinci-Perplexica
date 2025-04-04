'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { StockChartData } from '@/lib/services/stockService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface StockChartProps {
  data: StockChartData;
  height?: number;
  width?: number;
}

const StockChart = ({ data, height = 400, width = 800 }: StockChartProps) => {
  const chartRef = useRef<ChartJS>(null);

  const chartData = {
    labels: data.data.map(d => new Date(d.date).toLocaleTimeString()),
    datasets: [
      {
        label: `${data.symbol} Price`,
        data: data.data.map(d => d.close),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
      },
      {
        label: 'Volume',
        data: data.data.map(d => d.volume),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1,
        yAxisID: 'volume',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Price',
        },
      },
      volume: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Volume',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  return (
    <div style={{ height, width }}>
      <Line ref={chartRef} options={options} data={chartData} />
    </div>
  );
};

export default StockChart; 