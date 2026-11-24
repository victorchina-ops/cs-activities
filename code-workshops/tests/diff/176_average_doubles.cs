using System;

class Program
{
    static void Main()
    {
        int a = int.Parse(Console.ReadLine());
        int b = int.Parse(Console.ReadLine());
        int c = int.Parse(Console.ReadLine());
        double avg = (a + b + c) / 3.0;
        Console.WriteLine("avg = " + avg);
        Console.WriteLine("avg2 = " + (a + b + c) / 3);
        Console.WriteLine("rounded = " + Math.Round(avg, 2));
        Console.WriteLine("area = " + Math.PI * a * a);
        Console.WriteLine(avg * 100 / 100);
        Console.WriteLine(a / 3.0 * 3);
    }
}
