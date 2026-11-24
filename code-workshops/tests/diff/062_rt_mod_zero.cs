using System;

class Program
{
    static void Main()
    {
        int a = int.Parse(Console.ReadLine());
        Console.WriteLine("start");
        Console.WriteLine(a % (a - a));
    }
}
