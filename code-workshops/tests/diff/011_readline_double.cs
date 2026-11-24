using System;

class Program
{
    static void Main()
    {
        double x = double.Parse(Console.ReadLine());
        double y = double.Parse(Console.ReadLine());
        Console.WriteLine(x * y);
        Console.WriteLine(x / y);
        double z = double.Parse(Console.ReadLine());
        Console.WriteLine(z);
        Console.WriteLine(double.Parse(" 4 ") + double.Parse("-2"));
    }
}
