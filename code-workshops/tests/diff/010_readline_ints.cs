using System;

class Program
{
    static void Main()
    {
        Console.Write("a: ");
        int a = int.Parse(Console.ReadLine());
        Console.Write("b: ");
        int b = int.Parse(Console.ReadLine());
        Console.WriteLine("sum=" + (a + b));
        Console.WriteLine("full groups: " + a / b);
        Console.WriteLine("left: " + a % b);
    }
}
